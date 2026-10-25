import assert from "node:assert/strict";
import { test } from "vitest";
import { tokens } from "../claims-stand-in/schema.ts";
import { testApp, testDb } from "../test-helpers.ts";
import { type NewTap, passportStations, stations, taps, users } from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";

/** GET /api/v1/admin/taps, in the shape section 9.3 of API-AGREEMENT.md agrees. */
interface TapLogBody {
  taps: {
    id: number;
    client_tap_id: string;
    station: { id: string; name: string | null };
    user: { id: string; display_name: string | null };
    status: string;
    source: string;
    tapped_at: string | null;
    received_at: string;
  }[];
  next_before_id: number | null;
}

/**
 * Every test goes through GET /api/v1/admin/taps, the scan log's call (the
 * API agreement's 9.3). Stations, users and taps are written straight into the
 * tables, so these tests depend only on what is stored, not on how the
 * hand-off stored it.
 */
async function harness() {
  const app = testApp();
  const db = testDb();
  // Dev-login signs in only someone who has logged in to this event before.
  await db.insert(users).values([
    { id: ORGANIZER, displayName: "Olive" },
    { id: PARTICIPANT, displayName: "Alex" },
  ]);

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

  /** GET /api/v1/admin/taps with `query`, as `cookie`'s user. */
  const getTaps = (cookie: string, query = "") =>
    app.request(`/api/v1/admin/taps${query}`, { headers: { Cookie: cookie } });

  /** The tap log as an organizer sees it, which must be a 200. */
  const tapLog = async (query = ""): Promise<TapLogBody> => {
    const res = await getTaps(await signIn(ORGANIZER), query);
    assert.equal(res.status, 200);
    return (await res.json()) as TapLogBody;
  };

  /** Registers a station, outside the passport unless given a passport name. */
  const addStation = async (id: string, passportName?: string) => {
    await db.insert(stations).values({ id, label: `Reader ${id}`, apiKeyHash: `unused-${id}` });
    if (passportName)
      await db.insert(passportStations).values({ stationId: id, name: passportName });
  };

  let tapCount = 0;
  /** Stores a tap at `stationId`: accepted, NFC, by the participant, unless told otherwise. Returns its ID. */
  const addTap = async (stationId: string, tap: Partial<NewTap> = {}): Promise<number> => {
    tapCount++;
    const [{ id }] = await db
      .insert(taps)
      .values({
        stationId,
        clientTapId: `tap-${tapCount}`,
        userId: PARTICIPANT,
        status: "accepted",
        source: "nfc",
        receivedAt: new Date(Date.UTC(2026, 9, 10, 9, 0, tapCount)).toISOString(),
        ...tap,
      })
      .$returningId();
    return id;
  };

  return { db, signIn, getTaps, tapLog, addStation, addTap };
}

test("answers forbidden to a participant", async () => {
  const { getTaps, signIn } = await harness();
  const res = await getTaps(await signIn(PARTICIPANT));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});

test("lists a tap with its station, its user, its status and its source", async () => {
  const { tapLog, addStation, addTap } = await harness();
  await addStation("station-3", "3D Printing Booth");
  const id = await addTap("station-3", {
    clientTapId: "tap-000123",
    tappedAt: "2026-10-10T09:00:00.000Z",
    receivedAt: "2026-10-10T09:00:01.250Z",
  });

  assert.deepEqual(await tapLog(), {
    taps: [
      {
        id,
        client_tap_id: "tap-000123",
        station: { id: "station-3", name: "3D Printing Booth" },
        user: { id: PARTICIPANT, display_name: "Alex" },
        status: "accepted",
        source: "nfc",
        tapped_at: "2026-10-10T09:00:00.000Z",
        received_at: "2026-10-10T09:00:01.250Z",
      },
    ],
    next_before_id: null,
  });
});

test("lists every stored status and both sources, newest first", async () => {
  const { tapLog, addStation, addTap } = await harness();
  await addStation("station-passport", "3D Printing Booth");
  await addStation("station-outside");
  const accepted = await addTap("station-passport");
  const cooldown = await addTap("station-passport", { status: "cooldown" });
  const noGame = await addTap("station-outside", { status: "no_game" });
  const fallback = await addTap("station-passport", { source: "qr_fallback" });

  const listed = (await tapLog()).taps.map((tap) => [tap.id, tap.status, tap.source]);
  assert.deepEqual(listed, [
    [fallback, "accepted", "qr_fallback"],
    [noGame, "no_game", "nfc"],
    [cooldown, "cooldown", "nfc"],
    [accepted, "accepted", "nfc"],
  ]);
});

test("a station outside the passport has no name, and a user new to the event no display name", async () => {
  const { tapLog, addStation, addTap } = await harness();
  await addStation("station-outside");
  await addTap("station-outside", { userId: "never-logged-in", status: "no_game" });

  const [tap] = (await tapLog()).taps;
  assert.deepEqual(tap!.station, { id: "station-outside", name: null });
  assert.deepEqual(tap!.user, { id: "never-logged-in", display_name: null });
});

test("no token ID appears, even for a token the tap's user has claimed", async () => {
  const { db, getTaps, signIn, addStation, addTap } = await harness();
  await db.insert(tokens).values({ uid: "04A1B2C3D4E5F6", userId: PARTICIPANT });
  await addStation("station-3", "3D Printing Booth");
  await addTap("station-3");

  const body = await (await getTaps(await signIn(ORGANIZER))).text();
  assert.doesNotMatch(body, /04A1B2C3D4E5F6|token/i);
});

test("pages with limit and before_id, and next_before_id is null on the last page", async () => {
  const { tapLog, addStation, addTap } = await harness();
  await addStation("station-3", "3D Printing Booth");
  const ids: number[] = [];
  for (let i = 0; i < 5; i++) ids.push(await addTap("station-3"));
  const [first, second, third, fourth, fifth] = ids;

  const page1 = await tapLog("?limit=2");
  assert.deepEqual(
    page1.taps.map((tap) => tap.id),
    [fifth, fourth],
  );
  assert.equal(page1.next_before_id, fourth);

  const page2 = await tapLog(`?limit=2&before_id=${page1.next_before_id}`);
  assert.deepEqual(
    page2.taps.map((tap) => tap.id),
    [third, second],
  );
  assert.equal(page2.next_before_id, second);

  // Exactly as many taps left as the limit: none older, so no cursor.
  const page3 = await tapLog(`?limit=1&before_id=${page2.next_before_id}`);
  assert.deepEqual(
    page3.taps.map((tap) => tap.id),
    [first],
  );
  assert.equal(page3.next_before_id, null);
});

test("lists 50 taps when no limit is given", async () => {
  const { db, tapLog, addStation } = await harness();
  await addStation("station-3", "3D Printing Booth");
  await db.insert(taps).values(
    Array.from({ length: 51 }, (_, i) => ({
      stationId: "station-3",
      clientTapId: `bulk-${i}`,
      userId: PARTICIPANT,
      status: "accepted" as const,
      receivedAt: "2026-10-10T09:00:00.000Z",
    })),
  );

  const body = await tapLog();
  assert.equal(body.taps.length, 50);
  assert.equal(body.next_before_id, body.taps[49]!.id);
});

test("filters by station and by status, together with the cursor", async () => {
  const { tapLog, addStation, addTap } = await harness();
  await addStation("station-a", "Booth A");
  await addStation("station-b", "Booth B");
  const aAccepted = await addTap("station-a");
  const bAccepted = await addTap("station-b");
  const aCooldown = await addTap("station-a", { status: "cooldown" });
  const aAcceptedAgain = await addTap("station-a");

  const ids = async (query: string) => (await tapLog(query)).taps.map((tap) => tap.id);
  assert.deepEqual(await ids("?station_id=station-a"), [aAcceptedAgain, aCooldown, aAccepted]);
  assert.deepEqual(await ids("?status=accepted"), [aAcceptedAgain, bAccepted, aAccepted]);
  assert.deepEqual(await ids("?station_id=station-a&status=accepted"), [aAcceptedAgain, aAccepted]);

  const page = await tapLog("?station_id=station-a&status=accepted&limit=1");
  assert.equal(page.next_before_id, aAcceptedAgain);
  assert.deepEqual(await ids(`?station_id=station-a&status=accepted&before_id=${aAcceptedAgain}`), [
    aAccepted,
  ]);
});

test("a query outside the agreement's ranges answers validation_failed", async () => {
  const { getTaps, signIn } = await harness();
  const cookie = await signIn(ORGANIZER);
  for (const query of [
    "?limit=0",
    "?limit=201",
    "?limit=1.5",
    "?limit=many",
    "?before_id=x",
    "?before_id=",
    "?before_id=0",
    "?status=duplicate",
    "?status=unknown_token",
  ]) {
    const res = await getTaps(cookie, query);
    assert.equal(res.status, 400, query);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    assert.equal(body.error, "validation_failed", query);
    assert.ok(body.issues.length > 0, query);
  }
});
