import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import { test } from "vitest";
import type { Db } from "../db/pool.ts";
import { fakeClock, setupFixture, showcaseGames, testDb } from "../test-helpers.ts";
import { PASSPORT_GAME_ID, passportStations, stations, taps } from "./schema.ts";
import { type IncomingTap, TapPipeline } from "./tap-pipeline.ts";

async function pipeline(cooldownSeconds = 300) {
  const fx = await setupFixture();
  const clock = fakeClock("2026-10-10T09:00:00.000Z");
  const p = new TapPipeline(fx.db, {
    cooldownSeconds,
    games: showcaseGames,
    now: clock.now,
  });
  return { ...fx, clock, p };
}

function statuses(db: Db) {
  return db
    .select({ id: taps.clientTapId, status: taps.status, user: taps.userId })
    .from(taps)
    .orderBy(taps.id);
}

test("accepts a tap by a token's owner and stores it", async () => {
  const { p, db, stationId, userId } = await pipeline();
  const results = await p.ingest(stationId, [{ clientTapId: "t1", userId }]);
  assert.deepEqual(results, [
    {
      clientTapId: "t1",
      status: "accepted",
      userId,
      stationText: { lines: ["Alex: 1 of 1", "All 1 done!"], complete: true },
    },
  ]);
  assert.deepEqual(await statuses(db), [
    {
      id: "t1",
      status: "accepted",
      user: userId,
    },
  ]);
});

test("replaying a client_tap_id returns duplicate and writes nothing new", async () => {
  const { p, db, stationId, userId } = await pipeline();
  await p.ingest(stationId, [{ clientTapId: "t1", userId }]);
  const replay = await p.ingest(stationId, [{ clientTapId: "t1", userId }]);
  assert.equal(replay[0].status, "duplicate");
  assert.equal((await statuses(db)).length, 1);
});

test("repeated client_tap_id within one request is a duplicate", async () => {
  const { p, db, stationId, userId } = await pipeline();
  const results = await p.ingest(stationId, [
    { clientTapId: "t1", userId },
    { clientTapId: "t1", userId },
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["accepted", "duplicate"],
  );
  assert.equal((await statuses(db)).length, 1);
});

test("second tap inside the cooldown window is recorded as cooldown", async () => {
  const { p, db, stationId, userId, clock } = await pipeline(300);
  await p.ingest(stationId, [{ clientTapId: "t1", userId }]);
  clock.advanceSeconds(60);
  const second = await p.ingest(stationId, [{ clientTapId: "t2", userId }]);
  assert.equal(second[0].status, "cooldown");
  clock.advanceSeconds(300);
  const third = await p.ingest(stationId, [{ clientTapId: "t3", userId }]);
  assert.equal(third[0].status, "accepted");
  assert.deepEqual(
    (await statuses(db)).map((r) => r.status),
    ["accepted", "cooldown", "accepted"],
  );
});

test("cooldown of zero disables the check", async () => {
  const { p, stationId, userId } = await pipeline(0);
  const results = await p.ingest(stationId, [
    { clientTapId: "t1", userId },
    { clientTapId: "t2", userId },
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["accepted", "accepted"],
  );
});

test("offline flush is judged by device tapped_at, not arrival order", async () => {
  const { p, stationId, userId, clock } = await pipeline(300);
  // The station comes back online at 10:00 and flushes its buffer.
  clock.advanceSeconds(3600);
  // Buffered out of order: the 09:20 tap arrives before the 09:00 one.
  const results = await p.ingest(stationId, [
    { clientTapId: "late", userId, tappedAt: "2026-10-10T09:20:00Z" },
    { clientTapId: "early", userId, tappedAt: "2026-10-10T09:00:00Z" },
    { clientTapId: "repeat", userId, tappedAt: "2026-10-10T09:02:00Z" },
  ]);
  const byId = Object.fromEntries(results.map((r) => [r.clientTapId, r.status]));
  assert.deepEqual(byId, {
    early: "accepted",
    repeat: "cooldown",
    late: "accepted",
  });
});

test("an older buffered tap does not reset the cooldown for later taps", async () => {
  const { p, stationId, userId, clock } = await pipeline(300);
  await p.ingest(stationId, [
    {
      clientTapId: "live",
      userId,
      tappedAt: "2026-10-10T09:00:00Z",
    },
  ]);
  clock.advanceSeconds(300);
  const results = await p.ingest(stationId, [
    { clientTapId: "old", userId, tappedAt: "2026-10-10T08:00:00Z" },
    { clientTapId: "soon-after-live", userId, tappedAt: "2026-10-10T09:03:00Z" },
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["accepted", "cooldown"],
  );
});

test("a tap that arrives late is judged by the accepted tap nearest in time", async () => {
  const { p, stationId, userId } = await pipeline(300);
  await p.ingest(stationId, [
    { clientTapId: "t0800", userId, tappedAt: "2026-10-10T08:00:00Z" },
    { clientTapId: "t0900", userId, tappedAt: "2026-10-10T09:00:00Z" },
  ]);
  // Two minutes after the accepted 08:00 tap, though long before the newest one.
  const late = await p.ingest(stationId, [
    {
      clientTapId: "t0802",
      userId,
      tappedAt: "2026-10-10T08:02:00Z",
    },
  ]);
  assert.equal(late[0].status, "cooldown");
});

test("a tapped_at from a clock that never synced is ignored", async () => {
  const { p, db, stationId, userId, clock } = await pipeline(300);
  const first = await p.ingest(stationId, [
    {
      clientTapId: "t1",
      userId,
      tappedAt: "1970-01-01T00:00:05Z",
    },
  ]);
  assert.equal(first[0].status, "accepted");
  clock.advanceSeconds(60);
  // Judged against t1's receipt time, one minute ago, rather than 1970.
  const second = await p.ingest(stationId, [{ clientTapId: "t2", userId }]);
  assert.equal(second[0].status, "cooldown");
  const [stored] = await db
    .select({ tappedAt: taps.tappedAt })
    .from(taps)
    .where(eq(taps.clientTapId, "t1"));
  assert.equal(stored.tappedAt, null);
});

test("a tapped_at far in the future cannot open a gap in the cooldown", async () => {
  const { p, db, stationId, userId, clock } = await pipeline(300);
  await p.ingest(stationId, [
    {
      clientTapId: "t1",
      userId,
      tappedAt: "2026-10-10T09:00:00Z",
    },
  ]);
  const future = await p.ingest(stationId, [
    {
      clientTapId: "t2099",
      userId,
      tappedAt: "2099-01-01T00:00:00Z",
    },
  ]);
  assert.equal(future[0].status, "cooldown");
  clock.advanceSeconds(60);
  const next = await p.ingest(stationId, [
    {
      clientTapId: "t2",
      userId,
      tappedAt: "2026-10-10T09:01:00Z",
    },
  ]);
  assert.equal(next[0].status, "cooldown");
  const [stored] = await db
    .select({ tappedAt: taps.tappedAt })
    .from(taps)
    .where(eq(taps.clientTapId, "t2099"));
  assert.equal(stored.tappedAt, null);
});

test("keeps a tapped_at that is a little fast or days old", async () => {
  const { p, db, stationId, userId } = await pipeline(300);
  await p.ingest(stationId, [
    { clientTapId: "fast", userId, tappedAt: "2026-10-10T09:04:00Z" },
    { clientTapId: "old", userId, tappedAt: "2026-10-04T09:00:00Z" },
  ]);
  assert.deepEqual(
    await db.select({ id: taps.clientTapId, tappedAt: taps.tappedAt }).from(taps).orderBy(taps.id),
    [
      { id: "fast", tappedAt: "2026-10-10T09:04:00.000Z" },
      { id: "old", tappedAt: "2026-10-04T09:00:00.000Z" },
    ],
  );
});

test("results come back in request order", async () => {
  // Judged in the order the taps happened, 08:50 then 09:10, twenty minutes apart.
  const { p, stationId, userId } = await pipeline();
  const results = await p.ingest(stationId, [
    { clientTapId: "b", userId, tappedAt: "2026-10-10T09:10:00Z" },
    { clientTapId: "a", userId, tappedAt: "2026-10-10T08:50:00Z" },
    { clientTapId: "b", userId },
  ]);
  assert.deepEqual(
    results.map((r) => r.clientTapId),
    ["b", "a", "b"],
  );
  assert.deepEqual(
    results.map((r) => r.status),
    ["accepted", "accepted", "duplicate"],
  );
});

test("cooldown is per station", async () => {
  const { p, db, stationId, userId } = await pipeline(300);
  await db
    .insert(stations)
    .values({ id: "station-2", label: "Reader 2", apiKeyHash: "hash-2", game: PASSPORT_GAME_ID });
  await db.insert(passportStations).values({ stationId: "station-2", name: "Booth 2" });
  await p.ingest(stationId, [{ clientTapId: "t1", userId }]);
  const other = await p.ingest("station-2", [{ clientTapId: "t1", userId }]);
  assert.equal(other[0].status, "accepted");
});

test("a station without passport settings stores its taps as no_game, with no cooldown", async () => {
  // Reader 2 is registered, but no game counts its taps.
  const { p, db, userId, clock } = await pipeline(300);
  await db.insert(stations).values({ id: "station-2", label: "Reader 2", apiKeyHash: "hash-2" });
  const first = await p.ingest("station-2", [
    { clientTapId: "t1", userId },
    { clientTapId: "t1", userId },
  ]);
  clock.advanceSeconds(60);
  const second = await p.ingest("station-2", [{ clientTapId: "t2", userId }]);
  assert.deepEqual(
    [...first, ...second].map((r) => r.status),
    ["no_game", "duplicate", "no_game"],
  );
  assert.deepEqual(
    (await statuses(db)).map((r) => r.status),
    ["no_game", "no_game"],
  );
});

test("no_game taps don't hold back the first tap after the station joins the passport", async () => {
  const { p, db, userId, clock } = await pipeline(300);
  // It runs the passport, but has no settings yet.
  await db
    .insert(stations)
    .values({ id: "station-2", label: "Reader 2", apiKeyHash: "hash-2", game: PASSPORT_GAME_ID });
  await p.ingest("station-2", [{ clientTapId: "t1", userId }]);
  await db.insert(passportStations).values({ stationId: "station-2", name: "Booth 2" });
  clock.advanceSeconds(60);
  const results = await p.ingest("station-2", [{ clientTapId: "t2", userId }]);
  assert.equal(results[0].status, "accepted");
});

// Two ingests from one station at once, each on a connection of its own, as
// when a station's requests land on two Cloud Run instances.

/** A pipeline whose transaction takes a connection of its own from the pool. */
function pipelineOnItsOwnConnection(): TapPipeline {
  const db = testDb();
  return new TapPipeline(db, {
    cooldownSeconds: 300,
    games: showcaseGames,
  });
}

/**
 * Holds the station's row lock on a connection of its own, as a slow ingest
 * would. Returns a function that lets go of it.
 */
async function holdStationLock(stationId: string): Promise<() => Promise<void>> {
  const db = testDb();
  let letGo!: () => void;
  const lettingGo = new Promise<void>((resolve) => (letGo = resolve));
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const held = db.transaction(async (tx) => {
    await tx
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.id, stationId))
      .for("update");
    locked();
    await lettingGo;
  });
  await Promise.race([isLocked, held]);
  return async () => {
    letGo();
    await held;
  };
}

/** How many other connections are waiting for a station's row lock. */
async function waitingForStationLock(db: Db): Promise<number> {
  // Each connection's current statement, as TiDB shows it to the same login.
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.processlist
    WHERE id <> CONNECTION_ID() AND info LIKE '%from \`stations\`%for update%'
  `);
  const [row] = rows as unknown as { n: number | string }[];
  return Number(row!.n);
}

/**
 * Runs two ingests from one station, one tap each, so that they overlap: both
 * start while the station's lock is held elsewhere, and once it's let go, one
 * runs while the other is still waiting. Returns each tap's status, and
 * whether both really did wait.
 */
async function overlappingIngests(
  stationId: string,
  both: [IncomingTap, IncomingTap],
): Promise<{ statuses: string[]; bothWaited: boolean }> {
  const observer = testDb();
  const letGo = await holdStationLock(stationId);
  const ingests = both.map((tap) => pipelineOnItsOwnConnection().ingest(stationId, [tap]));
  let bothWaited = false;
  try {
    for (let i = 0; i < 100 && !bothWaited; i++) {
      bothWaited = (await waitingForStationLock(observer)) === 2;
      if (!bothWaited) await sleep(10);
    }
  } finally {
    await letGo();
  }
  const results = await Promise.all(ingests);
  return { statuses: results.map(([result]) => result!.status), bothWaited };
}

test("a resend racing its original on another connection comes back duplicate", async () => {
  const { db, stationId, userId } = await setupFixture();
  const overlap = await overlappingIngests(stationId, [
    { clientTapId: "t1", userId },
    { clientTapId: "t1", userId },
  ]);
  assert.deepEqual(overlap.statuses.sort(), ["accepted", "duplicate"]);
  assert.deepEqual(
    (await statuses(db)).map((r) => r.id),
    ["t1"],
  );
  assert.ok(overlap.bothWaited, "both ingests should wait for the station's lock");
});

test("two taps by one participant on two connections give one accepted and one cooldown", async () => {
  const { db, stationId, userId } = await setupFixture();
  const overlap = await overlappingIngests(stationId, [
    { clientTapId: "t1", userId },
    { clientTapId: "t2", userId },
  ]);
  assert.deepEqual(overlap.statuses.sort(), ["accepted", "cooldown"]);
  assert.deepEqual((await statuses(db)).map((r) => r.status).sort(), ["accepted", "cooldown"]);
  assert.ok(overlap.bothWaited, "both ingests should wait for the station's lock");
});

test("a failed ingest lets go of the station's lock", async () => {
  const { stationId, userId } = await setupFixture();
  // Longer than the column allows, so the insert fails after the lock is taken.
  await assert.rejects(
    pipelineOnItsOwnConnection().ingest(stationId, [{ clientTapId: "x".repeat(129), userId }]),
    /Failed query: insert into `taps`/,
  );
  const [next] = await pipelineOnItsOwnConnection().ingest(stationId, [
    { clientTapId: "t2", userId },
  ]);
  assert.equal(next!.status, "accepted");
});
