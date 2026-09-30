import assert from "node:assert/strict";
import { exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { stations, taps } from "../db/schema.ts";
import { setupFixture } from "../test-helpers.ts";

/** The fixture, and a way to post to the Worker as its station. */
async function harness() {
  const fx = await setupFixture();
  const post = (body: unknown, key: string | null = fx.stationKey) =>
    exports.default.fetch("http://localhost/api/v1/taps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify(body),
    });
  return { ...fx, post };
}

test("rejects requests without a station key", async () => {
  const { post, uid } = await harness();
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] }, null);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "missing_station_key" });
});

test("rejects an unknown station key", async () => {
  const { post, uid } = await harness();
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] }, "gk_sta_not-a-real-key");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_station_key" });
});

test("ingests a batch and returns a status per tap without user details", async () => {
  const { post, uid, stationId } = await harness();
  const res = await post({
    taps: [
      { client_tap_id: "t1", uid, tapped_at: "2026-10-10T09:00:00+08:00" },
      { client_tap_id: "t2", uid: "DE:AD:BE:EF" },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    station_id: stationId,
    results: [
      { client_tap_id: "t1", status: "accepted" },
      { client_tap_id: "t2", status: "unknown_token" },
    ],
  });
});

test("accepts a full batch of 500 taps", async () => {
  // The most a station sends at once, when it flushes its saved taps.
  const { post, db } = await harness();
  const res = await post({
    taps: Array.from({ length: 500 }, (_, i) => ({
      client_tap_id: `t${i}`,
      uid: "DEADBEEF",
    })),
  });
  assert.equal(res.status, 200);
  assert.equal((await db.select({ id: taps.id }).from(taps)).length, 500);
});

test("updates the station's last_seen_at on a successful request", async () => {
  const { post, uid, db, stationId } = await harness();
  await post({ taps: [{ client_tap_id: "t1", uid }] });
  const [row] = await db
    .select({ lastSeenAt: stations.lastSeenAt })
    .from(stations)
    .where(eq(stations.id, stationId))
    .limit(1);
  assert.ok(row?.lastSeenAt);
});

test("validates the body shape", async () => {
  const { post, uid } = await harness();
  for (const body of [
    {},
    { taps: [] },
    { taps: [{ uid }] },
    { taps: [{ client_tap_id: "t1", uid: "zz" }] },
    { taps: [{ client_tap_id: "t1", uid, tapped_at: "yesterday" }] },
    // One more than MAX_TAPS_PER_REQUEST in wrangler.jsonc.
    {
      taps: Array.from({ length: 501 }, (_, i) => ({ client_tap_id: `t${i}`, uid })),
    },
  ]) {
    const res = await post(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 80)}`);
    const json = await res.json<{ error: string }>();
    assert.equal(json.error, "validation_failed");
  }
});

test("unknown routes and methods return the JSON not_found error", async () => {
  for (const [method, path] of [
    ["GET", "/nope"],
    ["GET", "/api/v1/taps"],
  ]) {
    const res = await exports.default.fetch(`http://localhost${path}`, { method });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
});

test("treats an unparseable body as a 400, not a backend error", async () => {
  // A station that retried this as a 5xx would resend the same broken payload forever.
  const { stationKey } = await harness();
  const res = await exports.default.fetch("http://localhost/api/v1/taps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${stationKey}`,
    },
    body: '{"taps":[{',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json<{ error: string }>()).error, "validation_failed");
});
