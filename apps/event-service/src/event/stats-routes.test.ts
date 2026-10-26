import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { tokens } from "../claims-stand-in/schema.ts";
import { testApp, testDb } from "../test-helpers.ts";
import { type NewTap, passportStations, stations, taps, users } from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";

/** GET /api/v1/admin/stats, in the shape section 9.5 of API-AGREEMENT.md agrees. */
interface StatsBody {
  total_taps: number;
  accepted_taps: number;
  unique_participants: number;
  stations: {
    station_id: string;
    name: string;
    accepted_taps: number;
    unique_participants: number;
  }[];
}

/**
 * Every test goes through GET /api/v1/admin/stats, the organizers' totals
 * (the API agreement's 9.5). Stations, users and taps are written straight
 * into the tables, so these tests depend only on what is stored.
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

  /** GET /api/v1/admin/stats as `cookie`'s user. */
  const getStats = (cookie: string) =>
    app.request("/api/v1/admin/stats", { headers: { Cookie: cookie } });

  /** The stats as an organizer sees them, which must be a 200. */
  const stats = async (): Promise<StatsBody> => {
    const res = await getStats(await signIn(ORGANIZER));
    assert.equal(res.status, 200);
    return (await res.json()) as StatsBody;
  };

  /** Registers a station, outside the passport unless given passport settings. */
  const addStation = async (id: string, passport?: { name: string; addedAt?: string }) => {
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

  return { db, signIn, getStats, stats, addStation, addTap };
}

test("answers forbidden to a participant", async () => {
  const { getStats, signIn } = await harness();
  const res = await getStats(await signIn(PARTICIPANT));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});

test("totals count every stored status, and participants by their accepted taps", async () => {
  const { stats, addStation, addTap } = await harness();
  await addStation("station-passport", { name: "3D Printing Booth" });
  await addStation("station-outside");
  await addTap("station-passport");
  await addTap("station-passport");
  await addTap("station-passport", { status: "cooldown" });
  await addTap("station-passport", { userId: "user-2", source: "qr_fallback" });
  // Stored, so counted in total_taps, but neither accepted nor a participant.
  await addTap("station-passport", { userId: "user-3", status: "cooldown" });
  await addTap("station-outside", { userId: "user-4", status: "no_game" });

  const body = await stats();
  assert.equal(body.total_taps, 6);
  assert.equal(body.accepted_taps, 3);
  assert.equal(body.unique_participants, 2);
});

test("lists each passport station, oldest settings first, with its accepted taps and participants", async () => {
  const { db, stats, addStation, addTap } = await harness();
  // Created in one order, added to the passport in another: the stamp slots follow the passport.
  await addStation("station-b", { name: "Booth B", addedAt: "2026-10-10T08:00:02.000Z" });
  await addStation("station-a", { name: "Booth A", addedAt: "2026-10-10T08:00:01.000Z" });
  await addStation("station-quiet", { name: "Quiet Booth", addedAt: "2026-10-10T08:00:03.000Z" });
  await addStation("station-outside");
  await addTap("station-a");
  await addTap("station-a");
  await addTap("station-a", { userId: "user-2" });
  await addTap("station-a", { userId: "user-3", status: "cooldown" });
  await addTap("station-b", { userId: "user-2" });
  await addTap("station-outside", { status: "no_game" });
  // A disabled station keeps its slot and what was counted there.
  await db
    .update(stations)
    .set({ disabledAt: "2026-10-10T09:30:00.000Z" })
    .where(eq(stations.id, "station-b"));

  assert.deepEqual((await stats()).stations, [
    { station_id: "station-a", name: "Booth A", accepted_taps: 3, unique_participants: 2 },
    { station_id: "station-b", name: "Booth B", accepted_taps: 1, unique_participants: 1 },
    { station_id: "station-quiet", name: "Quiet Booth", accepted_taps: 0, unique_participants: 0 },
  ]);
});

test("an event with no taps has zeros, and its passport stations still listed", async () => {
  const { stats, addStation } = await harness();
  await addStation("station-a", { name: "Booth A" });

  assert.deepEqual(await stats(), {
    total_taps: 0,
    accepted_taps: 0,
    unique_participants: 0,
    stations: [
      { station_id: "station-a", name: "Booth A", accepted_taps: 0, unique_participants: 0 },
    ],
  });
});

test("no token ID appears, even for a token the tap's user has claimed", async () => {
  const { db, getStats, signIn, addStation, addTap } = await harness();
  await db.insert(tokens).values({ uid: "04A1B2C3D4E5F6", userId: PARTICIPANT });
  await addStation("station-3", { name: "3D Printing Booth" });
  await addTap("station-3");

  const body = await (await getStats(await signIn(ORGANIZER))).text();
  assert.doesNotMatch(body, /04A1B2C3D4E5F6|token/i);
});
