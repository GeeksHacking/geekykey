import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { setupFixture, testApp } from "../test-helpers.ts";
import {
  type NewTap,
  PASSPORT_GAME_ID,
  passportStations,
  stations,
  taps,
  users,
} from "./schema.ts";

const app = testApp();

/** Pinned so slot order does not depend on the day the tests run. */
const BOOTH_ADDED_AT = "2026-10-10T08:00:00.000Z";

/** GET /api/v1/me, in the shape section 8.1 of API-AGREEMENT.md agrees. */
interface MeBody {
  user: {
    id: string;
    display_name: string;
    role: string;
    has_name: boolean;
    kind: string | null;
  };
  points: number;
  stamps: {
    station_id: string;
    name: string;
    location: string | null;
    points: number;
    link: string | null;
    earned_at: string | null;
  }[];
  recent_taps: {
    id: number;
    station_id: string;
    station_name: string | null;
    status: string;
    source: string;
    tapped_at: string | null;
    received_at: string;
  }[];
  next_stop: { station_id: string; name: string; booth: string } | null;
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
    .update(passportStations)
    .set({ addedAt: BOOTH_ADDED_AT })
    .where(eq(passportStations.stationId, fx.stationId));

  /**
   * Adds a station, with passport settings unless it's left out. /me never
   * reads station keys, so each gets a placeholder hash.
   */
  const addStation = async (
    id: string,
    passport?: {
      name: string;
      addedAt: string;
      location?: string;
      points?: number;
      link?: string;
    },
    game: string | null = passport ? PASSPORT_GAME_ID : null,
  ) => {
    await fx.db.insert(stations).values({
      id,
      label: `Reader ${id}`,
      apiKeyHash: `unused-${id}`,
      game,
    });
    if (passport) await fx.db.insert(passportStations).values({ stationId: id, ...passport });
  };

  let tapCount = 0;
  /** Stores a tap. Unless told otherwise: accepted, NFC, Alex, Booth 1. */
  const addTap = (tap: Partial<NewTap> & Pick<NewTap, "receivedAt">) =>
    fx.db.insert(taps).values({
      stationId: fx.stationId,
      clientTapId: `tap-${++tapCount}`,
      userId: fx.userId,
      status: "accepted",
      ...tap,
    });

  return { ...fx, ...meClient(app), addStation, addTap };
}

/** Ways to call GET /api/v1/me on `target`, as nobody or as a signed-in user. */
function meClient(target: ReturnType<typeof testApp>) {
  const getMe = (cookie?: string) =>
    target.request("/api/v1/me", {
      headers: cookie ? { Cookie: cookie } : {},
    });

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    const login = await target.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    // Only the name=value pair travels back, the way a browser sends it.
    return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };

  /** Signs in through dev-login and returns the /me body, which must be a 200. */
  const meAs = async (userId: string): Promise<MeBody> => {
    const res = await getMe(await signIn(userId));
    assert.equal(res.status, 200);
    return (await res.json()) as MeBody;
  };

  /** PATCH /api/v1/me with `body` as JSON, as nobody or with `cookie`. */
  const patchMe = (body: unknown, cookie?: string) =>
    target.request("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  return { getMe, signIn, meAs, patchMe };
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
    user: { id: userId, display_name: "Alex", role: "participant", has_name: true, kind: null },
    points: 0,
    stamps: [
      {
        station_id: stationId,
        name: "Booth 1",
        location: null,
        points: 1,
        link: null,
        earned_at: null,
      },
    ],
    recent_taps: [],
    next_stop: null,
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

test("the passport names the next stop: the quietest booth the participant hasn't stamped", async () => {
  const { meAs, addStation, addTap, db, userId, stationId } = await harness();
  await addStation("b2", { name: "Robotics", addedAt: "2026-10-10T08:01:00.000Z" });
  await addStation("c3", { name: "Cloud Sponsor", addedAt: "2026-10-10T08:02:00.000Z" });
  // The quietest of all, but with no booth to send anyone to.
  await addStation("no-booth", { name: "Hidden", addedAt: "2026-10-10T08:03:00.000Z" });
  for (const [id, booth] of [
    [stationId, "A1"],
    ["b2", "B2"],
    ["c3", "C3"],
  ] as const) {
    await db.update(stations).set({ booth }).where(eq(stations.id, id));
  }
  const now = Date.now();
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  await addTap({ receivedAt: minutesAgo(1) });
  await addTap({ stationId: "b2", userId: "someone", receivedAt: minutesAgo(2) });
  await addTap({ stationId: "b2", userId: "someone-else", receivedAt: minutesAgo(3) });
  await addTap({ stationId: "c3", userId: "someone", receivedAt: minutesAgo(4) });
  // Too long ago to count.
  await addTap({ stationId: "c3", userId: "someone-else", receivedAt: minutesAgo(11) });
  await addTap({ stationId: "c3", userId: "a-third", receivedAt: minutesAgo(12) });

  assert.deepEqual((await meAs(userId)).next_stop, {
    station_id: "c3",
    name: "Cloud Sponsor",
    booth: "C3",
  });

  // With every stamp there is to send them to, none.
  await addTap({ stationId: "b2", receivedAt: minutesAgo(0) });
  await addTap({ stationId: "c3", receivedAt: minutesAgo(0) });
  assert.equal((await meAs(userId)).next_stop, null);
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
  await addStation("cloud", {
    name: "Cloud Sponsor",
    location: "Hall B",
    points: 2,
    addedAt: "2026-10-10T08:05:00.000Z",
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
      link: null,
      earned_at: "2026-10-10T09:00:00.000Z",
    },
    {
      station_id: "cloud",
      name: "Cloud Sponsor",
      location: "Hall B",
      points: 2,
      link: null,
      earned_at: "2026-10-10T09:30:00.000Z",
    },
  ]);
});

test("each slot gives its station's link, earned or not, or null for none", async () => {
  const { meAs, addStation, addTap, userId } = await harness();
  await addStation("printing", {
    name: "3D Printing",
    link: "https://example.com/3d-printing",
    addedAt: "2026-10-10T08:05:00.000Z",
  });
  await addStation("robotics", {
    name: "Robotics",
    link: "https://example.com/robotics",
    addedAt: "2026-10-10T08:06:00.000Z",
  });
  await addTap({ stationId: "printing", receivedAt: "2026-10-10T09:00:00.000Z" });
  const me = await meAs(userId);
  assert.deepEqual(
    me.stamps.map(({ name, link, earned_at }) => ({ name, link, earned: earned_at !== null })),
    [
      { name: "Booth 1", link: null, earned: false },
      { name: "3D Printing", link: "https://example.com/3d-printing", earned: true },
      { name: "Robotics", link: "https://example.com/robotics", earned: false },
    ],
  );
});

test("every passport station gets a slot, oldest settings first", async () => {
  // Neither name order nor insert order gives this sequence. Robotics Lab and
  // AI Corner were added in the same millisecond, so their ids break the tie.
  const { meAs, addStation, userId } = await harness();
  await addStation("station-b", { name: "AI Corner", addedAt: "2026-10-10T08:30:00.000Z" });
  await addStation("station-a", { name: "Robotics Lab", addedAt: "2026-10-10T08:30:00.000Z" });
  await addStation("station-c", { name: "Welcome Desk", addedAt: "2026-10-10T07:00:00.000Z" });
  const me = await meAs(userId);
  assert.deepEqual(
    me.stamps.map((s) => s.name),
    ["Welcome Desk", "Booth 1", "Robotics Lab", "AI Corner"],
  );
});

test("a station outside the passport has no slot, and its taps earn nothing", async () => {
  // Reader 2 is registered, and Alex tapped it, but no game counts its taps.
  const { meAs, addStation, addTap, userId, stationId } = await harness();
  await addStation("station-2");
  await addTap({
    stationId: "station-2",
    status: "no_game",
    receivedAt: "2026-10-10T09:00:00.000Z",
  });
  const me = await meAs(userId);
  assert.equal(me.points, 0);
  assert.deepEqual(
    me.stamps.map((s) => s.station_id),
    [stationId],
  );
  assert.deepEqual(
    me.recent_taps.map(({ station_id, station_name, status }) => ({
      station_id,
      station_name,
      status,
    })),
    [{ station_id: "station-2", station_name: null, status: "no_game" }],
  );
});

test("a station running another game has no slot, even with passport settings, and its taps no name", async () => {
  // Another game counted Alex's tap there, so it's accepted, but it earns no stamp.
  const { meAs, addStation, addTap, userId, stationId } = await harness();
  await addStation(
    "station-2",
    { name: "Old Booth", addedAt: "2026-10-10T08:00:00.000Z", points: 5 },
    "connections",
  );
  await addTap({ stationId: "station-2", receivedAt: "2026-10-10T09:00:00.000Z" });
  const me = await meAs(userId);
  assert.equal(me.points, 0);
  assert.deepEqual(
    me.stamps.map((s) => s.station_id),
    [stationId],
  );
  assert.deepEqual(
    me.recent_taps.map(({ station_id, station_name }) => ({ station_id, station_name })),
    [{ station_id: "station-2", station_name: null }],
  );
});

test("a station added to the passport later goes last, wherever it was created", async () => {
  // Reader 0 was registered before Booth 1, but joined the passport after it.
  const { meAs, addStation, db, userId, stationId } = await harness();
  await addStation("station-0", { name: "Late Booth", addedAt: "2026-10-10T12:00:00.000Z" });
  await db
    .update(stations)
    .set({ createdAt: "2026-10-01T00:00:00.000Z" })
    .where(eq(stations.id, "station-0"));
  const me = await meAs(userId);
  assert.deepEqual(
    me.stamps.map((s) => s.station_id),
    [stationId, "station-0"],
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
  await addStation("cloud", {
    name: "Cloud Sponsor",
    points: 2,
    addedAt: "2026-10-10T08:05:00.000Z",
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
  const { meAs, addTap, db, userId } = await harness();
  await db.insert(users).values({ id: "user-2", displayName: "Wei Lin" });
  await addTap({
    userId: "user-2",
    receivedAt: "2026-10-10T09:00:00.000Z",
  });
  const me = await meAs(userId);
  assert.equal(me.points, 0);
  assert.equal(me.stamps[0].earned_at, null);
  assert.deepEqual(me.recent_taps, []);
});

test("an organizer on the list gets the same view of their own account", async () => {
  // dev-organizer-1 is on the local organizer list, and dev-user-1 isn't.
  const { meAs, db, stationId } = await harness();
  await db.insert(users).values([
    { id: "dev-organizer-1", displayName: "Priya" },
    { id: "dev-user-1", displayName: "Wei Lin" },
  ]);
  assert.deepEqual(await meAs("dev-organizer-1"), {
    user: {
      id: "dev-organizer-1",
      display_name: "Priya",
      role: "organizer",
      has_name: true,
      kind: null,
    },
    points: 0,
    stamps: [
      {
        station_id: stationId,
        name: "Booth 1",
        location: null,
        points: 1,
        link: null,
        earned_at: null,
      },
    ],
    recent_taps: [],
    next_stop: null,
  });
  assert.equal((await meAs("dev-user-1")).user.role, "participant");
});

test("the role comes from the organizer list", async () => {
  const { db } = await harness();
  await db.insert(users).values([
    { id: "organizer-1", displayName: "Priya" },
    { id: "participant-1", displayName: "Sam" },
  ]);
  const listed = meClient(testApp({ ORGANIZERS: " organizer-1 ,someone-else," }));
  assert.equal((await listed.meAs("organizer-1")).user.role, "organizer");
  assert.equal((await listed.meAs("participant-1")).user.role, "participant");
  // An empty list, as production's starts.
  const empty = meClient(testApp({ ORGANIZERS: "" }));
  assert.equal((await empty.meAs("organizer-1")).user.role, "participant");
});

test("a participant sets the name the event shows, and /me shows it", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const res = await patchMe({ display_name: "Ally" }, await signIn(userId));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    user: { id: userId, display_name: "Ally", role: "participant", has_name: true, kind: null },
  });
  assert.equal((await meAs(userId)).user.display_name, "Ally");
});

test("a name is trimmed, then must be 1 to 30 code points, in any script", async () => {
  const { signIn, patchMe, getMe, userId } = await harness();
  const cookie = await signIn(userId);
  // Each emoji is one code point but two UTF-16 units, so 30 of them would fail a .length check.
  const accepted: [string, string][] = [
    ["A", "A"],
    ["  Ally Tan  ", "Ally Tan"],
    ["😀".repeat(30), "😀".repeat(30)],
    [`  ${"x".repeat(30)}  `, "x".repeat(30)],
    ["陈美玲", "陈美玲"],
  ];
  for (const [sent, saved] of accepted) {
    const res = await patchMe({ display_name: sent }, cookie);
    assert.equal(res.status, 200, sent);
    const { user } = (await res.json()) as { user: { display_name: string } };
    assert.equal(user.display_name, saved, sent);
  }

  for (const body of [
    { display_name: "" },
    { display_name: "   " },
    { display_name: "😀".repeat(31) },
    { display_name: "x".repeat(31) },
    { display_name: 7 },
    {},
  ]) {
    const res = await patchMe(body, cookie);
    const what = JSON.stringify(body);
    assert.equal(res.status, 400, what);
    const json = (await res.json()) as { error: string; issues: { path: string[] }[] };
    assert.equal(json.error, "validation_failed", what);
    assert.deepEqual(json.issues[0]?.path, ["display_name"], what);
  }
  // A refused name leaves the last good one.
  assert.equal(((await (await getMe(cookie)).json()) as MeBody).user.display_name, "陈美玲");
});

test("setting a name needs a session", async () => {
  const { patchMe } = await harness();
  const res = await patchMe({ display_name: "Ally" });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});
