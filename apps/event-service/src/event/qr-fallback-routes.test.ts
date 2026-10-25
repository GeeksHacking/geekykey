import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { fakeClock, testApp, testDb } from "../test-helpers.ts";
import { passportStations, stations, taps, users } from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";
const BOOTH = "station-booth";

/** POST /api/v1/admin/taps's 201, in the shape section 9.4 of API-AGREEMENT.md agrees. */
interface FallbackBody {
  result: { id: number; status: string };
}

/** A tap as the scan log (9.3) lists it. */
interface LoggedTap {
  id: number;
  client_tap_id: string;
  station: { id: string; name: string | null };
  user: { id: string; display_name: string | null };
  status: string;
  source: string;
  tapped_at: string | null;
  received_at: string;
}

/** The part of GET /api/v1/me (8.1) a QR fallback tap changes. */
interface MeBody {
  points: number;
  stamps: { station_id: string; earned_at: string | null }[];
}

/**
 * Every test goes through POST /api/v1/admin/taps, the QR fallback (the API
 * agreement's 9.4), and reads what it stored back through the scan log (9.3)
 * and the participant's GET /api/v1/me, as the screens would. Stations and
 * users are written straight into the tables. The clock is pinned, so the
 * cooldown can be stepped past.
 */
async function harness() {
  const clock = fakeClock("2026-10-10T09:00:00.000Z");
  const app = testApp({}, { now: clock.now });
  const db = testDb();
  // Dev-login signs in only someone who has logged in to this event before.
  await db.insert(users).values([
    { id: ORGANIZER, displayName: "Olive" },
    { id: PARTICIPANT, displayName: "Alex" },
  ]);
  await addStation(BOOTH, "3D Printing Booth");

  /** Registers a station, outside the passport unless given a passport name. */
  async function addStation(id: string, passportName?: string) {
    await db.insert(stations).values({ id, label: `Reader ${id}`, apiKeyHash: `unused-${id}` });
    if (passportName)
      await db.insert(passportStations).values({ stationId: id, name: passportName });
  }

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };

  /** POST /api/v1/admin/taps with `body`, as `cookie`'s user, or nobody when `cookie` is null. */
  const postTap = (cookie: string | null, body: unknown) =>
    app.request("/api/v1/admin/taps", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  /** The organizer logs a tap at `stationId` for `userId`, which must be a 201. */
  const logTap = async (stationId = BOOTH, userId = PARTICIPANT): Promise<FallbackBody> => {
    const res = await postTap(await signIn(ORGANIZER), { station_id: stationId, user_id: userId });
    assert.equal(res.status, 201);
    return (await res.json()) as FallbackBody;
  };

  /** Every stored tap, newest first, as the organizer's scan log lists them. */
  const tapLog = async (): Promise<LoggedTap[]> => {
    const res = await app.request("/api/v1/admin/taps", {
      headers: { Cookie: await signIn(ORGANIZER) },
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { taps: LoggedTap[] }).taps;
  };

  /** `userId`'s points and stamps, from their own GET /api/v1/me (8.1). */
  const meAs = async (userId: string): Promise<MeBody> => {
    const res = await app.request("/api/v1/me", { headers: { Cookie: await signIn(userId) } });
    assert.equal(res.status, 200);
    return (await res.json()) as MeBody;
  };

  return { clock, db, addStation, signIn, postTap, logTap, tapLog, meAs };
}

test("an organizer logs a tap for a participant, stored as a QR fallback", async () => {
  const { logTap, tapLog } = await harness();

  const { result } = await logTap();

  assert.equal(result.status, "accepted");
  const [tap] = await tapLog();
  assert.deepEqual(tap, {
    id: result.id,
    client_tap_id: tap!.client_tap_id,
    station: { id: BOOTH, name: "3D Printing Booth" },
    user: { id: PARTICIPANT, display_name: "Alex" },
    status: "accepted",
    source: "qr_fallback",
    tapped_at: null,
    received_at: "2026-10-10T09:00:00.000Z",
  });
  assert.ok(tap!.client_tap_id.length > 0);
});

test("a tap inside the cooldown answers cooldown, and one after it counts again", async () => {
  const { clock, logTap, tapLog } = await harness();

  assert.equal((await logTap()).result.status, "accepted");
  clock.advanceSeconds(299);
  assert.equal((await logTap()).result.status, "cooldown");
  clock.advanceSeconds(1);
  assert.equal((await logTap()).result.status, "accepted");

  assert.deepEqual(
    (await tapLog()).map((tap) => [tap.status, tap.source]),
    [
      ["accepted", "qr_fallback"],
      ["cooldown", "qr_fallback"],
      ["accepted", "qr_fallback"],
    ],
  );
});

test("a station's own tap puts a QR fallback tap in the cooldown, as another station tap would", async () => {
  const { db, logTap } = await harness();
  await db.insert(taps).values({
    stationId: BOOTH,
    clientTapId: "tap-000001",
    userId: PARTICIPANT,
    source: "nfc",
    status: "accepted",
    tappedAt: "2026-10-10T08:58:00.000Z",
    receivedAt: "2026-10-10T08:58:01.000Z",
  });

  assert.equal((await logTap()).result.status, "cooldown");
});

test("a station without passport settings, or none of this Event Service's, is not_found, and nothing is stored", async () => {
  const { addStation, signIn, postTap, tapLog } = await harness();
  await addStation("station-plain");
  const cookie = await signIn(ORGANIZER);

  for (const stationId of ["station-plain", "station-unknown"]) {
    const res = await postTap(cookie, { station_id: stationId, user_id: PARTICIPANT });
    assert.equal(res.status, 404, stationId);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
  assert.deepEqual(await tapLog(), []);
});

test("a participant is forbidden, and nobody signed in is unauthenticated", async () => {
  const { signIn, postTap, tapLog } = await harness();
  const body = { station_id: BOOTH, user_id: PARTICIPANT };

  const asParticipant = await postTap(await signIn(PARTICIPANT), body);
  assert.equal(asParticipant.status, 403);
  assert.deepEqual(await asParticipant.json(), { error: "forbidden" });
  const signedOut = await postTap(null, body);
  assert.equal(signedOut.status, 401);
  assert.deepEqual(await signedOut.json(), { error: "unauthenticated" });
  assert.deepEqual(await tapLog(), []);
});

test("both fields are required, and a blank or over-long user ID fails validation", async () => {
  const { signIn, postTap, tapLog } = await harness();
  const cookie = await signIn(ORGANIZER);

  for (const [what, body, field] of [
    ["no station_id", { user_id: PARTICIPANT }, "station_id"],
    ["no user_id", { station_id: BOOTH }, "user_id"],
    ["a blank user_id", { station_id: BOOTH, user_id: "  " }, "user_id"],
    ["a user_id of 129 characters", { station_id: BOOTH, user_id: "u".repeat(129) }, "user_id"],
    ["a station_id that isn't a string", { station_id: 7, user_id: PARTICIPANT }, "station_id"],
  ] as const) {
    const res = await postTap(cookie, body);
    assert.equal(res.status, 400, what);
    const answer = (await res.json()) as { error: string; issues: { path: string[] }[] };
    assert.equal(answer.error, "validation_failed", what);
    assert.deepEqual(
      answer.issues.map((issue) => issue.path),
      [[field]],
      what,
    );
  }
  assert.deepEqual(await tapLog(), []);
});

test("a user ID is taken trimmed, even one that has never logged in to this event", async () => {
  const { signIn, postTap, tapLog } = await harness();

  const res = await postTap(await signIn(ORGANIZER), { station_id: BOOTH, user_id: " new-user " });

  assert.equal(res.status, 201);
  assert.deepEqual(
    (await tapLog()).map((tap) => tap.user),
    [{ id: "new-user", display_name: null }],
  );
});

test("an accepted QR fallback tap earns the participant the stamp and its points", async () => {
  const { db, logTap, clock, meAs } = await harness();
  await db.update(passportStations).set({ points: 3 });

  await logTap();
  clock.advanceSeconds(60);
  await logTap();

  // The second is inside the cooldown, so it earns nothing.
  const me = await meAs(PARTICIPANT);
  assert.equal(me.points, 3);
  assert.deepEqual(
    me.stamps.map((stamp) => [stamp.station_id, stamp.earned_at]),
    [[BOOTH, "2026-10-10T09:00:00.000Z"]],
  );
});

test("a disabled passport station still takes a QR fallback tap, as its saved taps would count", async () => {
  const { db, logTap } = await harness();
  await db.update(stations).set({ disabledAt: "2026-10-10T08:30:00.000Z" });

  assert.equal((await logTap()).result.status, "accepted");
});

test("the tap's tap_stored line says it's a QR fallback, and a line says which organizer logged it", async () => {
  const { logTap, tapLog } = await harness();
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => logged.mockRestore());

  await logTap();

  const [tap] = await tapLog();
  assert.deepEqual(
    logged.mock.calls.map(([line]) => JSON.parse(line as string)),
    [
      {
        severity: "INFO",
        message: "tap_stored",
        station_id: BOOTH,
        client_tap_id: tap!.client_tap_id,
        user_id: PARTICIPANT,
        tapped_at: null,
        status: "accepted",
        source: "qr_fallback",
      },
      {
        severity: "INFO",
        message: "qr_fallback_logged",
        user_id: ORGANIZER,
        station_id: BOOTH,
        client_tap_id: tap!.client_tap_id,
      },
    ],
  );
});
