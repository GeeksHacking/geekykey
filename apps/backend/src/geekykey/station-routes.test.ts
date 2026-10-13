import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { onTestFinished, test, vi } from "vitest";
import type { AppOptions } from "../app.ts";
import { stations, taps } from "../event/schema.ts";
import { setupFixture, testApp } from "../test-helpers.ts";

const app = testApp();

/**
 * The fixture, and a way to post to the backend as its station. `app` is the
 * backend the station posts to, with the real claims stand-in unless a test
 * gives it a fake.
 */
async function harness(target = app) {
  const fx = await setupFixture();
  const post = (body: unknown, key: string | null = fx.stationKey) =>
    target.request("/api/v1/taps", {
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

/** Every line logged to stdout during this test, each read as one JSON object. */
function loggedLines() {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => {
    logged.mockRestore();
    errors.mockRestore();
  });
  return () =>
    [...logged.mock.calls, ...errors.mock.calls].map(
      ([line]) => JSON.parse(line as string) as Record<string, unknown>,
    );
}

test("a tap by a claimed token is accepted, without user details", async () => {
  const { post, uid, stationId, db, userId } = await harness();
  const res = await post({
    taps: [{ client_tap_id: "t1", uid, tapped_at: "2026-10-10T09:00:00+08:00" }],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    station_id: stationId,
    results: [{ client_tap_id: "t1", status: "accepted" }],
  });
  const stored = await db.select({ id: taps.clientTapId, user: taps.userId }).from(taps);
  assert.deepEqual(stored, [{ id: "t1", user: userId }]);
});

test("a tap by a token nobody owns is unknown_token, logged, and stored nowhere", async () => {
  const { post, stationId, db } = await harness();
  const lines = loggedLines();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: "DE:AD:BE:EF" }] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    station_id: stationId,
    results: [{ client_tap_id: "t1", status: "unknown_token" }],
  });
  assert.deepEqual(await db.select().from(taps), []);
  assert.deepEqual(lines(), [
    {
      severity: "INFO",
      message: "unknown_token",
      station_id: stationId,
      client_tap_id: "t1",
      uid: "DEADBEEF",
    },
  ]);
});

test("a batch mixing claimed and unclaimed tokens gets its statuses in request order", async () => {
  const { post, uid, db } = await harness();
  loggedLines();
  const res = await post({
    taps: [
      { client_tap_id: "a", uid: "DEADBEEF" },
      { client_tap_id: "b", uid },
      { client_tap_id: "c", uid: "CAFEF00D" },
      { client_tap_id: "b", uid },
    ],
  });
  const { results } = (await res.json()) as {
    results: { client_tap_id: string; status: string }[];
  };
  assert.deepEqual(results, [
    { client_tap_id: "a", status: "unknown_token" },
    { client_tap_id: "b", status: "accepted" },
    { client_tap_id: "c", status: "unknown_token" },
    { client_tap_id: "b", status: "duplicate" },
  ]);
  assert.deepEqual(
    (await db.select({ id: taps.clientTapId }).from(taps)).map((t) => t.id),
    ["b"],
  );
});

test("a UID in any separator style finds its owner", async () => {
  const { post } = await harness();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: "04:a1:b2:c3:d4:e5:f6" }] });
  const { results } = (await res.json()) as { results: { status: string }[] };
  assert.equal(results[0]!.status, "accepted");
});

test("accepts a full batch of 500 taps", async () => {
  // The most a station sends at once, when it flushes its saved taps.
  const { post, db, uid } = await harness();
  const res = await post({
    taps: Array.from({ length: 500 }, (_, i) => ({
      client_tap_id: `t${i}`,
      uid,
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
    // One more than MAX_TAPS_PER_REQUEST allows by default.
    {
      taps: Array.from({ length: 501 }, (_, i) => ({ client_tap_id: `t${i}`, uid })),
    },
  ]) {
    const res = await post(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 80)}`);
    const json = (await res.json()) as { error: string };
    assert.equal(json.error, "validation_failed");
  }
});

test("unknown routes and methods return the JSON not_found error", async () => {
  for (const [method, path] of [
    ["GET", "/nope"],
    ["GET", "/api/v1/taps"],
  ]) {
    const res = await app.request(path, { method });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
});

test("treats an unparseable body as a 400, not a backend error", async () => {
  // A station that retried this as a 5xx would resend the same broken payload forever.
  const { stationKey } = await harness();
  const res = await app.request("/api/v1/taps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${stationKey}`,
    },
    body: '{"taps":[{',
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
});

// The claims stand-in faked at its requests, as it might fail on production.

/**
 * The backend with the claims stand-in replaced by `answer`, called for each
 * request the GeekyKey side sends it, and a deadline short enough for a test.
 */
function withStandIn(answer: (url: string) => Promise<Response>) {
  const requests: string[] = [];
  const sendToClaimsStandIn: AppOptions["sendToClaimsStandIn"] = (url) => {
    requests.push(url);
    return answer(url);
  };
  const target = testApp({ TAP_DEADLINE_MS: "200" }, { sendToClaimsStandIn });
  return { target, requests };
}

const never = () => new Promise<Response>(() => {});

for (const [what, answer] of [
  ["an answer that never comes", never],
  ["a 500", async () => Response.json({ error: "internal_error" }, { status: 500 })],
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  ["a 429", async () => new Response("Too Many Requests", { status: 429 })],
  ["a body that isn't JSON", async () => new Response("<html>", { status: 200 })],
  ["a body of the wrong shape", async () => Response.json({ owners: [{ uid: "DEADBEEF" }] })],
] as const) {
  test(`${what} from the claims stand-in fails the request with 503 claims_unavailable`, async () => {
    const { target, requests } = withStandIn(answer);
    const { post, uid, stationId, db } = await harness(target);
    const lines = loggedLines();

    const started = Date.now();
    const res = await post({ taps: [{ client_tap_id: "t1", uid }] });
    const took = Date.now() - started;

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "claims_unavailable" });
    // Within the deadline, with a little room for the rest of the request.
    assert.ok(took < 1000, `took ${took} ms`);
    // Asked once, and never again.
    assert.deepEqual(requests, ["/claims-stand-in/v1/owners"]);
    assert.deepEqual(await db.select().from(taps), []);
    const [line, ...rest] = lines();
    assert.deepEqual(rest, []);
    assert.equal(line!.message, "claims_unavailable");
    assert.equal(line!.severity, "ERROR");
    assert.equal(line!.station_id, stationId);
  });
}

test("claims_unavailable says why, without the key", async () => {
  const { target } = withStandIn(async () => new Response("", { status: 503 }));
  const { post, uid } = await harness(target);
  const lines = loggedLines();
  await post({ taps: [{ client_tap_id: "t1", uid }] });
  const [line] = lines();
  assert.equal(line!.reason, "status");
  assert.equal(line!.status, 503);
  assert.doesNotMatch(JSON.stringify(line), /5{64}/);
});
