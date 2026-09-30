import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { Db } from "../db/hyperdrive.ts";
import { stations, taps, tokens } from "../db/schema.ts";
import { fakeClock, setupFixture } from "../test-helpers.ts";
import { LocalTokenResolver } from "./identity.ts";
import { TapPipeline } from "./taps.ts";

async function pipeline(cooldownSeconds = 300) {
  const fx = await setupFixture();
  const clock = fakeClock("2026-10-10T09:00:00.000Z");
  const p = new TapPipeline(fx.db, new LocalTokenResolver(fx.db), {
    cooldownSeconds,
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

Deno.test("accepts a tap from a paired token and stores it", async () => {
  const { p, db, stationId, uid, userId } = await pipeline();
  const results = await p.ingest(stationId, [{ clientTapId: "t1", uid }]);
  assert.deepEqual(results, [{
    clientTapId: "t1",
    status: "accepted",
    userId,
  }]);
  assert.deepEqual(await statuses(db), [{
    id: "t1",
    status: "accepted",
    user: userId,
  }]);
});

Deno.test("records an unknown token instead of dropping it", async () => {
  const { p, db, stationId } = await pipeline();
  const results = await p.ingest(stationId, [{
    clientTapId: "t1",
    uid: "DEADBEEF",
  }]);
  assert.equal(results[0].status, "unknown_token");
  assert.deepEqual(await statuses(db), [{
    id: "t1",
    status: "unknown_token",
    user: null,
  }]);
});

Deno.test("normalises reader UID formats before lookup", async () => {
  const { p, stationId } = await pipeline();
  const results = await p.ingest(stationId, [{
    clientTapId: "t1",
    uid: "04:a1:b2:c3:d4:e5:f6",
  }]);
  assert.equal(results[0].status, "accepted");
});

Deno.test("replaying a client_tap_id returns duplicate and writes nothing new", async () => {
  const { p, db, stationId, uid } = await pipeline();
  await p.ingest(stationId, [{ clientTapId: "t1", uid }]);
  const replay = await p.ingest(stationId, [{ clientTapId: "t1", uid }]);
  assert.equal(replay[0].status, "duplicate");
  assert.equal((await statuses(db)).length, 1);
});

Deno.test("repeated client_tap_id within one request is a duplicate", async () => {
  const { p, db, stationId, uid } = await pipeline();
  const results = await p.ingest(stationId, [
    { clientTapId: "t1", uid },
    { clientTapId: "t1", uid },
  ]);
  assert.deepEqual(results.map((r) => r.status), ["accepted", "duplicate"]);
  assert.equal((await statuses(db)).length, 1);
});

Deno.test("second tap inside the cooldown window is recorded as cooldown", async () => {
  const { p, db, stationId, uid, clock } = await pipeline(300);
  await p.ingest(stationId, [{ clientTapId: "t1", uid }]);
  clock.advanceSeconds(60);
  const second = await p.ingest(stationId, [{ clientTapId: "t2", uid }]);
  assert.equal(second[0].status, "cooldown");
  clock.advanceSeconds(300);
  const third = await p.ingest(stationId, [{ clientTapId: "t3", uid }]);
  assert.equal(third[0].status, "accepted");
  assert.deepEqual((await statuses(db)).map((r) => r.status), [
    "accepted",
    "cooldown",
    "accepted",
  ]);
});

Deno.test("cooldown of zero disables the check", async () => {
  const { p, stationId, uid } = await pipeline(0);
  const results = await p.ingest(stationId, [
    { clientTapId: "t1", uid },
    { clientTapId: "t2", uid },
  ]);
  assert.deepEqual(results.map((r) => r.status), ["accepted", "accepted"]);
});

Deno.test("offline flush is judged by device tapped_at, not arrival order", async () => {
  const { p, stationId, uid, clock } = await pipeline(300);
  // The station comes back online at 10:00 and flushes its buffer.
  clock.advanceSeconds(3600);
  // Buffered out of order: the 09:20 tap arrives before the 09:00 one.
  const results = await p.ingest(stationId, [
    { clientTapId: "late", uid, tappedAt: "2026-10-10T09:20:00Z" },
    { clientTapId: "early", uid, tappedAt: "2026-10-10T09:00:00Z" },
    { clientTapId: "repeat", uid, tappedAt: "2026-10-10T09:02:00Z" },
  ]);
  const byId = Object.fromEntries(
    results.map((r) => [r.clientTapId, r.status]),
  );
  assert.deepEqual(byId, {
    early: "accepted",
    repeat: "cooldown",
    late: "accepted",
  });
});

Deno.test("an older buffered tap does not reset the cooldown for later taps", async () => {
  const { p, stationId, uid, clock } = await pipeline(300);
  await p.ingest(stationId, [{
    clientTapId: "live",
    uid,
    tappedAt: "2026-10-10T09:00:00Z",
  }]);
  clock.advanceSeconds(300);
  const results = await p.ingest(stationId, [
    { clientTapId: "old", uid, tappedAt: "2026-10-10T08:00:00Z" },
    { clientTapId: "soon-after-live", uid, tappedAt: "2026-10-10T09:03:00Z" },
  ]);
  assert.deepEqual(results.map((r) => r.status), ["accepted", "cooldown"]);
});

Deno.test("a tap that arrives late is judged by the accepted tap nearest in time", async () => {
  const { p, stationId, uid } = await pipeline(300);
  await p.ingest(stationId, [
    { clientTapId: "t0800", uid, tappedAt: "2026-10-10T08:00:00Z" },
    { clientTapId: "t0900", uid, tappedAt: "2026-10-10T09:00:00Z" },
  ]);
  // Two minutes after the accepted 08:00 tap, though long before the newest one.
  const late = await p.ingest(stationId, [{
    clientTapId: "t0802",
    uid,
    tappedAt: "2026-10-10T08:02:00Z",
  }]);
  assert.equal(late[0].status, "cooldown");
});

Deno.test("a tapped_at from a clock that never synced is ignored", async () => {
  const { p, db, stationId, uid, clock } = await pipeline(300);
  const first = await p.ingest(stationId, [{
    clientTapId: "t1",
    uid,
    tappedAt: "1970-01-01T00:00:05Z",
  }]);
  assert.equal(first[0].status, "accepted");
  clock.advanceSeconds(60);
  // Judged against t1's receipt time, one minute ago, rather than 1970.
  const second = await p.ingest(stationId, [{ clientTapId: "t2", uid }]);
  assert.equal(second[0].status, "cooldown");
  const [stored] = await db.select({ tappedAt: taps.tappedAt }).from(taps)
    .where(eq(taps.clientTapId, "t1"));
  assert.equal(stored.tappedAt, null);
});

Deno.test("a tapped_at far in the future cannot open a gap in the cooldown", async () => {
  const { p, db, stationId, uid, clock } = await pipeline(300);
  await p.ingest(stationId, [{
    clientTapId: "t1",
    uid,
    tappedAt: "2026-10-10T09:00:00Z",
  }]);
  const future = await p.ingest(stationId, [{
    clientTapId: "t2099",
    uid,
    tappedAt: "2099-01-01T00:00:00Z",
  }]);
  assert.equal(future[0].status, "cooldown");
  clock.advanceSeconds(60);
  const next = await p.ingest(stationId, [{
    clientTapId: "t2",
    uid,
    tappedAt: "2026-10-10T09:01:00Z",
  }]);
  assert.equal(next[0].status, "cooldown");
  const [stored] = await db.select({ tappedAt: taps.tappedAt }).from(taps)
    .where(eq(taps.clientTapId, "t2099"));
  assert.equal(stored.tappedAt, null);
});

Deno.test("keeps a tapped_at that is a little fast or days old", async () => {
  const { p, db, stationId, uid } = await pipeline(300);
  await p.ingest(stationId, [
    { clientTapId: "fast", uid, tappedAt: "2026-10-10T09:04:00Z" },
    { clientTapId: "old", uid, tappedAt: "2026-10-04T09:00:00Z" },
  ]);
  assert.deepEqual(
    await db.select({ id: taps.clientTapId, tappedAt: taps.tappedAt })
      .from(taps).orderBy(taps.id),
    [
      { id: "fast", tappedAt: "2026-10-10T09:04:00.000Z" },
      { id: "old", tappedAt: "2026-10-04T09:00:00.000Z" },
    ],
  );
});

Deno.test("overlapping requests replaying one client_tap_id store it once and report one duplicate", async () => {
  const { p, db, stationId, uid } = await pipeline();
  const results = await Promise.all([
    p.ingest(stationId, [{ clientTapId: "t1", uid }]),
    p.ingest(stationId, [{ clientTapId: "t1", uid }]),
  ]);
  assert.deepEqual(results.map((r) => r[0].status).sort(), [
    "accepted",
    "duplicate",
  ]);
  assert.equal((await statuses(db)).length, 1);
});

Deno.test("overlapping requests for one participant still respect the cooldown", async () => {
  const { p, db, stationId, uid } = await pipeline(300);
  const results = await Promise.all([
    p.ingest(stationId, [{ clientTapId: "t1", uid }]),
    p.ingest(stationId, [{ clientTapId: "t2", uid }]),
  ]);
  assert.deepEqual(results.map((r) => r[0].status).sort(), [
    "accepted",
    "cooldown",
  ]);
  assert.deepEqual((await statuses(db)).map((r) => r.status).sort(), [
    "accepted",
    "cooldown",
  ]);
});

Deno.test("a failed ingest does not hold up the station's next request", async () => {
  const fx = await setupFixture();
  let failNext = true;
  const real = new LocalTokenResolver(fx.db);
  const p = new TapPipeline(fx.db, {
    resolveMany(uids) {
      if (!failNext) return real.resolveMany(uids);
      failNext = false;
      return Promise.reject(new Error("database unreachable"));
    },
  }, { cooldownSeconds: 300 });
  const [failed, next] = await Promise.allSettled([
    p.ingest(fx.stationId, [{ clientTapId: "t1", uid: fx.uid }]),
    p.ingest(fx.stationId, [{ clientTapId: "t2", uid: fx.uid }]),
  ]);
  assert.equal(failed.status, "rejected");
  assert.equal(next.status, "fulfilled");
  assert.equal(next.value[0].status, "accepted");
});

Deno.test("results come back in request order", async () => {
  const { p, stationId, uid } = await pipeline();
  const results = await p.ingest(stationId, [
    { clientTapId: "a", uid: "DEADBEEF" },
    { clientTapId: "b", uid },
    { clientTapId: "a", uid: "DEADBEEF" },
  ]);
  assert.deepEqual(results.map((r) => r.clientTapId), ["a", "b", "a"]);
  assert.deepEqual(results.map((r) => r.status), [
    "unknown_token",
    "accepted",
    "duplicate",
  ]);
});

Deno.test("cooldown is per station", async () => {
  const { p, db, stationId, uid } = await pipeline(300);
  await db.insert(stations).values({
    id: "station-2",
    name: "Booth 2",
    apiKeyHash: "hash-2",
  });
  await p.ingest(stationId, [{ clientTapId: "t1", uid }]);
  const other = await p.ingest("station-2", [{ clientTapId: "t1", uid }]);
  assert.equal(other[0].status, "accepted");
});

Deno.test("revoked tokens resolve as unknown", async () => {
  const { p, db, stationId, uid } = await pipeline();
  await db.update(tokens).set({ revokedAt: "2026-10-01T00:00:00Z" }).where(
    eq(tokens.uid, uid),
  );
  const results = await p.ingest(stationId, [{ clientTapId: "t1", uid }]);
  assert.equal(results[0].status, "unknown_token");
});
