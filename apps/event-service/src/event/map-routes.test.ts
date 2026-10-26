import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { tokens } from "../claims-stand-in/schema.ts";
import { TEST_EVENT_SERVICE_KEY, testApp, testDb } from "../test-helpers.ts";
import { type NewTap, passportStations, stations, taps, users } from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";

/** GET /api/v1/map, in the shape section 9.10 of API-AGREEMENT.md agrees. */
interface MapBody {
  stations: {
    station_id: string;
    name: string;
    booth: string | null;
    disabled: boolean;
    taps: number;
    unique_participants: number;
    last_tap_at: string | null;
  }[];
}

/**
 * Every test goes through GET /api/v1/map, what the map on the big screen
 * draws (the API agreement's 9.10). Stations, users and taps are written
 * straight into the tables, so these tests depend only on what is stored.
 */
async function harness(settings: Record<string, string> = {}) {
  const app = testApp(settings);
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

  /** GET /api/v1/map as `cookie`'s user, or with no session. */
  const getMap = (cookie?: string) =>
    app.request("/api/v1/map", { headers: cookie ? { Cookie: cookie } : {} });

  /** The map as an organizer reads it, which must be a 200. */
  const map = async (): Promise<MapBody> => {
    const res = await getMap(await signIn(ORGANIZER));
    assert.equal(res.status, 200);
    return (await res.json()) as MapBody;
  };

  /** Registers a station, outside the passport unless given passport settings. */
  const addStation = async (
    id: string,
    passport?: Omit<typeof passportStations.$inferInsert, "stationId">,
  ) => {
    await db.insert(stations).values({ id, label: `Reader ${id}`, apiKeyHash: `unused-${id}` });
    if (passport) await db.insert(passportStations).values({ stationId: id, ...passport });
  };

  let tapCount = 0;
  /** Stores a tap at `stationId`: accepted, NFC, by the participant, unless told otherwise. */
  const addTap = async (stationId: string, tap: Partial<NewTap> = {}) => {
    tapCount++;
    await db.insert(taps).values({
      stationId,
      clientTapId: `tap-${tapCount}`,
      userId: PARTICIPANT,
      status: "accepted",
      source: "nfc",
      receivedAt: new Date(Date.UTC(2026, 9, 10, 9, 0, tapCount)).toISOString(),
      ...tap,
    });
  };

  return { app, db, signIn, getMap, map, addStation, addTap };
}

test("lists each passport station in stamp-slot order, counting accepted and cooldown taps", async () => {
  const { db, map, addStation, addTap } = await harness();
  // Created in one order, added to the passport in another: the slots follow the passport.
  await addStation("station-b", { name: "Booth B", addedAt: "2026-10-10T08:00:02.000Z" });
  await addStation("station-a", { name: "Booth A", addedAt: "2026-10-10T08:00:01.000Z" });
  await addStation("station-quiet", { name: "Quiet Booth", addedAt: "2026-10-10T08:00:03.000Z" });
  await addStation("station-outside");
  await addTap("station-a", { receivedAt: "2026-10-10T09:00:01.000Z" });
  await addTap("station-a", { userId: "user-2", receivedAt: "2026-10-10T09:00:02.000Z" });
  // A cooldown tap counts as a tap, and is the newest, but its user earned no stamp here.
  await addTap("station-a", {
    userId: "user-3",
    status: "cooldown",
    receivedAt: "2026-10-10T09:00:04.000Z",
  });
  // A QR fallback tap counts like a station's.
  await addTap("station-b", {
    source: "qr_fallback",
    receivedAt: "2026-10-10T09:00:03.000Z",
  });
  // Stored before station-b joined the passport, so not counted.
  await addTap("station-b", { status: "no_game", receivedAt: "2026-10-10T09:00:05.000Z" });
  await addTap("station-outside", { status: "no_game" });
  // A disabled station keeps its place on the map and what was counted there.
  await db
    .update(stations)
    .set({ disabledAt: "2026-10-10T09:30:00.000Z" })
    .where(eq(stations.id, "station-b"));

  assert.deepEqual((await map()).stations, [
    {
      station_id: "station-a",
      name: "Booth A",
      booth: null,
      disabled: false,
      taps: 3,
      unique_participants: 2,
      last_tap_at: "2026-10-10T09:00:04.000Z",
    },
    {
      station_id: "station-b",
      name: "Booth B",
      booth: null,
      disabled: true,
      taps: 1,
      unique_participants: 1,
      last_tap_at: "2026-10-10T09:00:03.000Z",
    },
    {
      station_id: "station-quiet",
      name: "Quiet Booth",
      booth: null,
      disabled: false,
      taps: 0,
      unique_participants: 0,
      last_tap_at: null,
    },
  ]);
});

/** The map screen these tests list in MAP_SCREENS. */
const MAP_SCREEN = "map-screen-1";

test("an organizer and a listed map screen may read the map; anyone else gets forbidden", async () => {
  const { db, signIn, getMap } = await harness({ MAP_SCREENS: ` ${MAP_SCREEN} ,map-screen-2,` });
  await db.insert(users).values({ id: MAP_SCREEN, displayName: "Booth screen" });

  for (const userId of [ORGANIZER, MAP_SCREEN]) {
    const res = await getMap(await signIn(userId));
    assert.equal(res.status, 200, userId);
    assert.deepEqual(await res.json(), { stations: [] }, userId);
  }
  const res = await getMap(await signIn(PARTICIPANT));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});

test("nobody signed in gets unauthenticated", async () => {
  const { getMap } = await harness({ MAP_SCREENS: MAP_SCREEN });
  const res = await getMap();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("a map screen is no organizer: every organizer endpoint answers it forbidden", async () => {
  const { app, db, signIn, addStation } = await harness({ MAP_SCREENS: MAP_SCREEN });
  await db.insert(users).values({ id: MAP_SCREEN, displayName: "Booth screen" });
  await addStation("station-3", { name: "3D Printing Booth" });
  const cookie = await signIn(MAP_SCREEN);

  for (const [method, path, body] of [
    ["GET", "/api/v1/admin/stations"],
    ["POST", "/api/v1/admin/stations", { label: "Reader 9" }],
    ["PUT", "/api/v1/admin/stations/station-3/passport", { name: "Renamed" }],
    ["POST", "/api/v1/admin/stations/station-3/key"],
    ["POST", "/api/v1/admin/stations/station-3/disable"],
    ["POST", "/api/v1/admin/stations/station-3/enable"],
    ["GET", "/api/v1/admin/taps"],
    ["POST", "/api/v1/admin/taps", { station_id: "station-3", user_id: PARTICIPANT }],
    ["GET", "/api/v1/admin/stats"],
    ["GET", "/api/v1/admin/export.csv"],
  ] as const) {
    const res = await app.request(path, {
      method,
      headers: {
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "forbidden" }, `${method} ${path}`);
  }
  // And its /me says participant, since a map screen isn't a role (8.1).
  const me = await app.request("/api/v1/me", { headers: { Cookie: cookie } });
  assert.equal(((await me.json()) as { user: { role: string } }).user.role, "participant");
  // Nothing it sent changed the station.
  const [station] = await db.select().from(stations).where(eq(stations.id, "station-3"));
  assert.equal(station!.disabledAt, null);
  assert.equal(station!.apiKeyHash, "unused-station-3");
});

test("a booth set in the passport settings shows on the map and the station board", async () => {
  const { app, signIn, map, addStation } = await harness();
  await addStation("station-3");
  await addStation("station-4");
  const cookie = await signIn(ORGANIZER);
  const putPassport = (stationId: string, body: unknown) =>
    app.request(`/api/v1/admin/stations/${stationId}/passport`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const added = await putPassport("station-3", { name: "3D Printing Booth", booth: " A3 " });
  assert.equal(added.status, 201);
  assert.equal(((await added.json()) as { passport: { booth: string } }).passport.booth, "A3");
  assert.equal((await putPassport("station-4", { name: "Robotics" })).status, 201);

  const boothOf = (stations: { booth: string | null }[]) => stations.map((s) => s.booth);
  assert.deepEqual(boothOf((await map()).stations), ["A3", null]);
  const board = await app.request("/api/v1/admin/stations", { headers: { Cookie: cookie } });
  const boardBody = (await board.json()) as { stations: { passport: { booth: string | null } }[] };
  assert.deepEqual(boothOf(boardBody.stations.map((s) => s.passport)), ["A3", null]);

  // Moved on the day, with no deploy.
  assert.equal(
    (await putPassport("station-3", { name: "3D Printing Booth", booth: "B7" })).status,
    200,
  );
  assert.deepEqual(boothOf((await map()).stations), ["B7", null]);
});

test("the body has no user ID, display name or token ID", async () => {
  const { db, getMap, signIn, addStation, addTap } = await harness();
  await db.insert(tokens).values({ uid: "04A1B2C3D4E5F6", userId: PARTICIPANT });
  await addStation("station-3", { name: "3D Printing Booth", booth: "A3" });
  await addTap("station-3");
  await addTap("station-3", { status: "cooldown" });

  const res = await getMap(await signIn(ORGANIZER));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(body, new RegExp(`${PARTICIPANT}|${ORGANIZER}|Alex|Olive|04A1B2C3D4E5F6`));
  assert.doesNotMatch(body, /user|token|display/i);
});

test("a tap handed on by the GeekyKey Service shows in the next read of the map", async () => {
  const { app, map, addStation } = await harness();
  await addStation("station-3", { name: "3D Printing Booth", booth: "A3" });
  const handOff = (clientTapId: string) =>
    app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        station_id: "station-3",
        taps: [{ client_tap_id: clientTapId, user_id: PARTICIPANT, tapped_at: null }],
      }),
    });

  const before = (await map()).stations[0]!;
  assert.equal(before.taps, 0);
  assert.equal((await handOff("t1")).status, 200);
  const after = (await map()).stations[0]!;
  assert.equal(after.taps, 1);
  assert.equal(after.unique_participants, 1);
  assert.notEqual(after.last_tap_at, null);
  // A second tap in the cooldown earns nothing, but the map still pulses.
  assert.equal((await handOff("t2")).status, 200);
  const again = (await map()).stations[0]!;
  assert.equal(again.taps, 2);
  assert.equal(again.unique_participants, 1);
});
