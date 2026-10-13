import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { setupFixture, testApp } from "../test-helpers.ts";
import { type NewTap, stations, taps, users } from "./schema.ts";

const app = testApp();

/** Pinned so slot order does not depend on the day the tests run. */
const BOOTH_CREATED_AT = "2026-10-10T08:00:00.000Z";

/**
 * GET /api/v1/me in today's shape: section 8.1 of API-AGREEMENT.md is the
 * agreed shape, and the paragraph after its list says how today's backend
 * still differs from it.
 */
interface MeBody {
  user: { id: string; display_name: string; role: string };
  points: number;
  stamps: {
    station_id: string;
    name: string;
    location: string | null;
    points: number;
    earned_at: string | null;
  }[];
  recent_taps: {
    id: number;
    station_id: string;
    station_name: string;
    status: string;
    source: string;
    tapped_at: string | null;
    received_at: string;
  }[];
}

/**
 * Every test goes through GET /api/v1/me, the contract the frontend reads.
 * Taps are written straight into the table rather than sent through the tap
 * pipeline, so these tests only depend on what is stored, not on how the
 * pipeline decided each status.
 */
async function harness() {
  const fx = await setupFixture();
  await fx.db
    .update(stations)
    .set({ createdAt: BOOTH_CREATED_AT })
    .where(eq(stations.id, fx.stationId));

  const getMe = (cookie?: string) =>
    app.request("/api/v1/me", {
      headers: cookie ? { Cookie: cookie } : {},
    });

  /** Signs in through dev-login and returns the /me body, which must be a 200. */
  const meAs = async (userId: string): Promise<MeBody> => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    // Only the name=value pair travels back, the way a browser sends it.
    const cookie = (login.headers.get("Set-Cookie") ?? "").split(";")[0];
    const res = await getMe(cookie);
    assert.equal(res.status, 200);
    return (await res.json()) as MeBody;
  };

  /** /me never reads station keys, so each extra station gets a placeholder hash. */
  const addStation = (station: {
    id: string;
    name: string;
    createdAt: string;
    location?: string;
    points?: number;
  }) =>
    fx.db.insert(stations).values({
      apiKeyHash: `unused-${station.id}`,
      ...station,
    });

  let tapCount = 0;
  /** Stores a tap. Unless told otherwise: accepted, NFC, Alex, Booth 1. */
  const addTap = (tap: Partial<NewTap> & Pick<NewTap, "receivedAt">) =>
    fx.db.insert(taps).values({
      stationId: fx.stationId,
      clientTapId: `tap-${++tapCount}`,
      tokenUid: fx.uid,
      userId: fx.userId,
      status: "accepted",
      ...tap,
    });

  return { ...fx, getMe, meAs, addStation, addTap };
}

test("answers unauthenticated when nobody is signed in", async () => {
  const { getMe } = await harness();
  const res = await getMe();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("a participant who has not tapped yet gets an empty passport, and no tokens", async () => {
  // A user's tokens are on the GeekyKey Service's /me, not this one.
  const { meAs, userId, stationId } = await harness();
  assert.deepEqual(await meAs(userId), {
    user: { id: userId, display_name: "Alex", role: "participant" },
    points: 0,
    stamps: [
      {
        station_id: stationId,
        name: "Booth 1",
        location: null,
        points: 1,
        earned_at: null,
      },
    ],
    recent_taps: [],
  });
});

test("the first accepted tap at a station earns its stamp", async () => {
  const { meAs, addTap, userId } = await harness();
  await addTap({ receivedAt: "2026-10-10T09:00:00.000Z" });
  await addTap({ receivedAt: "2026-10-10T09:02:00.000Z", status: "cooldown" });
  await addTap({ receivedAt: "2026-10-10T09:10:00.000Z" });
  const me = await meAs(userId);
  assert.equal(me.stamps[0].earned_at, "2026-10-10T09:00:00.000Z");
});

test("a stamp is dated when its tap reached the backend, not when the station read it", async () => {
  // Booth 1 was offline: it read the token at 09:05 and sent the tap at 09:20.
  const { meAs, addTap, userId } = await harness();
  await addTap({
    tappedAt: "2026-10-10T09:05:00.000Z",
    receivedAt: "2026-10-10T09:20:00.000Z",
  });
  const me = await meAs(userId);
  assert.equal(me.stamps[0].earned_at, "2026-10-10T09:20:00.000Z");
});

test("a cooldown tap is listed but earns nothing", async () => {
  const { meAs, addTap, userId } = await harness();
  await addTap({ receivedAt: "2026-10-10T09:00:00.000Z" });
  await addTap({ receivedAt: "2026-10-10T09:01:00.000Z", status: "cooldown" });
  const me = await meAs(userId);
  assert.equal(me.points, 1);
  assert.deepEqual(
    me.recent_taps.map((t) => t.status),
    ["cooldown", "accepted"],
  );
});

test("points count every accepted tap, while a slot shows what its station is worth", async () => {
  // Alex visits Booth 1 (1 point) three times, 10 minutes apart, and Cloud Sponsor (2 points) once.
  const { meAs, addStation, addTap, userId, stationId } = await harness();
  await addStation({
    id: "cloud",
    name: "Cloud Sponsor",
    location: "Hall B",
    points: 2,
    createdAt: "2026-10-10T08:05:00.000Z",
  });
  await addTap({ receivedAt: "2026-10-10T09:00:00.000Z" });
  await addTap({ receivedAt: "2026-10-10T09:10:00.000Z" });
  await addTap({ receivedAt: "2026-10-10T09:20:00.000Z" });
  await addTap({ stationId: "cloud", receivedAt: "2026-10-10T09:30:00.000Z" });
  const me = await meAs(userId);
  assert.equal(me.points, 5);
  assert.deepEqual(me.stamps, [
    {
      station_id: stationId,
      name: "Booth 1",
      location: null,
      points: 1,
      earned_at: "2026-10-10T09:00:00.000Z",
    },
    {
      station_id: "cloud",
      name: "Cloud Sponsor",
      location: "Hall B",
      points: 2,
      earned_at: "2026-10-10T09:30:00.000Z",
    },
  ]);
});

test("every station gets a slot, oldest station first", async () => {
  // Neither name order nor insert order gives this sequence. Robotics Lab and
  // AI Corner were created in the same millisecond, so their ids break the tie.
  const { meAs, addStation, userId } = await harness();
  await addStation({
    id: "station-b",
    name: "AI Corner",
    createdAt: "2026-10-10T08:30:00.000Z",
  });
  await addStation({
    id: "station-a",
    name: "Robotics Lab",
    createdAt: "2026-10-10T08:30:00.000Z",
  });
  await addStation({
    id: "station-c",
    name: "Welcome Desk",
    createdAt: "2026-10-10T07:00:00.000Z",
  });
  const me = await meAs(userId);
  assert.deepEqual(
    me.stamps.map((s) => s.name),
    ["Welcome Desk", "Booth 1", "Robotics Lab", "AI Corner"],
  );
});

test("recent taps are the latest 50, newest first", async () => {
  const { meAs, addTap, userId } = await harness();
  // 55 taps, 10 minutes apart, from 09:10 to 18:10.
  const nineAm = Date.parse("2026-10-10T09:00:00.000Z");
  for (let i = 1; i <= 55; i++) {
    await addTap({ receivedAt: new Date(nineAm + i * 600_000).toISOString() });
  }
  const me = await meAs(userId);
  const times = me.recent_taps.map((t) => t.received_at);
  assert.equal(times.length, 50);
  assert.equal(times[0], "2026-10-10T18:10:00.000Z");
  assert.equal(times[49], "2026-10-10T10:00:00.000Z");
  assert.deepEqual(times, [...times].sort().reverse());
});

test("recent taps are in the order the backend received them", async () => {
  // Booth 1 is offline when it reads Alex's token at 09:05. At 09:10 an
  // organizer logs a QR fallback tap for Alex at Cloud Sponsor. Booth 1 comes
  // back and sends its tap at 09:20, so that tap is listed first.
  const { meAs, addStation, addTap, userId, stationId } = await harness();
  await addStation({
    id: "cloud",
    name: "Cloud Sponsor",
    points: 2,
    createdAt: "2026-10-10T08:05:00.000Z",
  });
  await addTap({
    stationId: "cloud",
    source: "qr_fallback",
    receivedAt: "2026-10-10T09:10:00.000Z",
  });
  await addTap({
    tappedAt: "2026-10-10T09:05:00.000Z",
    receivedAt: "2026-10-10T09:20:00.000Z",
  });
  const me = await meAs(userId);
  // Tap ids are the database's to choose, so only their type is checked.
  const withoutIds = me.recent_taps.map(({ id, ...tap }) => {
    assert.equal(typeof id, "number");
    return tap;
  });
  assert.deepEqual(withoutIds, [
    {
      station_id: stationId,
      station_name: "Booth 1",
      status: "accepted",
      source: "nfc",
      tapped_at: "2026-10-10T09:05:00.000Z",
      received_at: "2026-10-10T09:20:00.000Z",
    },
    {
      station_id: "cloud",
      station_name: "Cloud Sponsor",
      status: "accepted",
      source: "qr_fallback",
      tapped_at: null,
      received_at: "2026-10-10T09:10:00.000Z",
    },
  ]);
});

test("shows only the signed-in participant's own taps", async () => {
  // One tap by another participant, and one by a token nobody had claimed yet.
  const { meAs, addTap, db, userId } = await harness();
  await db.insert(users).values({ id: "user-2", displayName: "Wei Lin" });
  await addTap({
    userId: "user-2",
    tokenUid: "0455D2F1C83A91",
    receivedAt: "2026-10-10T09:00:00.000Z",
  });
  await addTap({
    userId: null,
    tokenUid: "DEADBEEF",
    status: "unknown_token",
    receivedAt: "2026-10-10T09:01:00.000Z",
  });
  const me = await meAs(userId);
  assert.equal(me.points, 0);
  assert.equal(me.stamps[0].earned_at, null);
  assert.deepEqual(me.recent_taps, []);
});

test("an organizer gets the same view of their own account", async () => {
  const { meAs, db, stationId } = await harness();
  await db.insert(users).values({
    id: "organizer-1",
    displayName: "Priya",
    role: "organizer",
  });
  assert.deepEqual(await meAs("organizer-1"), {
    user: { id: "organizer-1", display_name: "Priya", role: "organizer" },
    points: 0,
    stamps: [
      {
        station_id: stationId,
        name: "Booth 1",
        location: null,
        points: 1,
        earned_at: null,
      },
    ],
    recent_taps: [],
  });
});
