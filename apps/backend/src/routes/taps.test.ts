import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createApp } from "../app.ts";
import type { Config } from "../config.ts";
import { stations } from "../db/schema.ts";
import { setupFixture } from "../test-helpers.ts";

const config: Config = {
  port: 0,
  databaseUrl: ":memory:",
  databaseAuthToken: undefined,
  tapCooldownSeconds: 300,
  maxTapsPerRequest: 3,
  devAuthEnabled: true,
  sessionSecret: "test-secret-at-least-16",
  sessionCookieSecure: false,
};

async function harness() {
  const fx = await setupFixture();
  const app = createApp({ db: fx.db, config });
  const post = (body: unknown, key: string | null = fx.stationKey) =>
    app.request("/api/v1/taps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify(body),
    });
  return { ...fx, app, post };
}

Deno.test("rejects requests without a station key", async () => {
  const { post, uid } = await harness();
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] }, null);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "missing_station_key" });
});

Deno.test("rejects an unknown station key", async () => {
  const { post, uid } = await harness();
  const res = await post(
    { taps: [{ client_tap_id: "t1", uid }] },
    "gk_sta_not-a-real-key",
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_station_key" });
});

Deno.test("ingests a batch and returns a status per tap without user details", async () => {
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

Deno.test("updates the station's last_seen_at on a successful request", async () => {
  const { post, uid, db, stationId } = await harness();
  await post({ taps: [{ client_tap_id: "t1", uid }] });
  const row = await db
    .select({ lastSeenAt: stations.lastSeenAt })
    .from(stations)
    .where(eq(stations.id, stationId))
    .get();
  assert.ok(row?.lastSeenAt);
});

Deno.test("validates the body shape", async () => {
  const { post, uid } = await harness();
  for (
    const body of [
      {},
      { taps: [] },
      { taps: [{ uid }] },
      { taps: [{ client_tap_id: "t1", uid: "zz" }] },
      { taps: [{ client_tap_id: "t1", uid, tapped_at: "yesterday" }] },
      {
        taps: Array.from(
          { length: 4 },
          (_, i) => ({ client_tap_id: `t${i}`, uid }),
        ),
      },
    ]
  ) {
    const res = await post(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    const json = await res.json();
    assert.equal(json.error, "validation_failed");
  }
});

Deno.test("health endpoints still respond", async () => {
  const { app } = await harness();
  const res = await app.request("/api/health");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "ok");
});
