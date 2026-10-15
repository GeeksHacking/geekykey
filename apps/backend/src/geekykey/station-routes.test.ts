import assert from "node:assert/strict";
import type { RegisteredStation } from "@geekykey/handoff";
import { eq } from "drizzle-orm";
import { onTestFinished, test, vi } from "vitest";
import type { AppOptions } from "../app.ts";
import { passportStations, stations, taps } from "../event/schema.ts";
import {
  setupFixture,
  testApp,
  TEST_EVENT_SERVICE_KEY,
  TEST_EVENT_SERVICE_URL,
} from "../test-helpers.ts";
import type { Send } from "./service-request.ts";
import { hashStationKey } from "./station-keys.ts";

/**
 * The fixture, and ways to post taps and heartbeats to the backend as its
 * station. `target` is the backend the station posts to, with the real
 * claims stand-in and Event side unless a test gives it a fake. Each test has
 * its own, since a backend keeps its copy of the registered stations while it
 * runs.
 */
async function harness(target = testApp()) {
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
  const postHeartbeat = (body: unknown, key: string | null = fx.stationKey) =>
    target.request("/api/v1/stations/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify(body),
    });
  return { ...fx, post, postHeartbeat, target };
}

test("rejects requests without a station key", async () => {
  const { post, uid } = await harness();
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] }, null);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "missing_station_key" });
});

test("rejects an unknown station key", async () => {
  const { post, uid } = await harness();
  loggedLines();
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] }, "gk_sta_not-a-real-key");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_station_key" });
});

test("rejects a disabled station's key", async () => {
  const { post, uid, db, stationId } = await harness();
  loggedLines();
  await db
    .update(stations)
    .set({ disabledAt: "2026-10-14T01:00:00.000Z" })
    .where(eq(stations.id, stationId));
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_station_key" });
});

/**
 * Every line logged during this test, each read as one JSON object. Not the
 * line each backend writes as it fills its copy of the registered stations on
 * its first request, which stations-copy.test.ts covers.
 */
function loggedLines() {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => {
    logged.mockRestore();
    errors.mockRestore();
  });
  return () =>
    [...logged.mock.calls, ...errors.mock.calls]
      .map(([line]) => JSON.parse(line as string) as Record<string, unknown>)
      .filter((line) => line.message !== "stations_copy_filled");
}

test("a tap is accepted, a resend duplicate, and a second tap cooldown, through the hand-off", async () => {
  const { post, uid, stationId, db, userId } = await harness();
  loggedLines();
  const answers = [];
  for (const id of ["t1", "t1", "t2"]) {
    const res = await post({ taps: [{ client_tap_id: id, uid }] });
    assert.equal(res.status, 200);
    answers.push(await res.json());
  }
  // Without user details: readers must not hold any.
  assert.deepEqual(answers, [
    { station_id: stationId, results: [{ client_tap_id: "t1", status: "accepted" }] },
    { station_id: stationId, results: [{ client_tap_id: "t1", status: "duplicate" }] },
    { station_id: stationId, results: [{ client_tap_id: "t2", status: "cooldown" }] },
  ]);
  // Stored with the owner's user ID, and no token UID.
  const stored = await db
    .select({ id: taps.clientTapId, user: taps.userId, uid: taps.tokenUid })
    .from(taps)
    .orderBy(taps.id);
  assert.deepEqual(stored, [
    { id: "t1", user: userId, uid: null },
    { id: "t2", user: userId, uid: null },
  ]);
});

test("a tap at a station outside the passport is no_game, through the hand-off", async () => {
  const { post, uid, stationId, db } = await harness();
  loggedLines();
  await db.delete(passportStations).where(eq(passportStations.stationId, stationId));
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    station_id: stationId,
    results: [{ client_tap_id: "t1", status: "no_game" }],
  });
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

test("the hand-off updates the station's last_seen_at", async () => {
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
    const res = await testApp().request(path, { method });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
});

test("treats an unparseable body as a 400, not a backend error", async () => {
  // A station that retried this as a 5xx would resend the same broken payload forever.
  const { stationKey, target } = await harness();
  loggedLines();
  const res = await target.request("/api/v1/taps", {
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

// The Event side faked at its requests, as it might fail once it runs apart.

interface HandOff {
  url: string;
  authorization: string | null;
  body: {
    station_id: string;
    taps: { client_tap_id: string; user_id: string; tapped_at: string | null }[];
  };
}

const STATIONS_URL = `${TEST_EVENT_SERVICE_URL}/geekykey/v1/stations`;

/** The Event side's own answer, from a backend of its own. */
const realEventSide: Send = async (url, init) => testApp().request(url, init);

/**
 * The backend with the Event side's hand-off replaced by `answer`, called for
 * each hand-off the GeekyKey side sends it, and a deadline short enough for a
 * test. Its registered stations come from `stations`, the real Event side's
 * unless a test fakes them.
 */
function withEventService(
  answer: (handOff: HandOff) => Promise<Response>,
  stations: Send = realEventSide,
) {
  const handOffs: HandOff[] = [];
  const sendToEventService: Send = async (url, init) => {
    if (url === STATIONS_URL) return stations(url, init);
    const handOff = {
      url,
      authorization: new Headers(init.headers).get("Authorization"),
      body: JSON.parse(init.body as string),
    };
    handOffs.push(handOff);
    return answer(handOff);
  };
  const target = testApp({ TAP_DEADLINE_MS: "200" }, { sendToEventService });
  return { target, handOffs };
}

/** What the Event side would answer: each tap accepted. */
async function acceptEach({ body }: HandOff) {
  return Response.json({
    results: body.taps.map((t) => ({ client_tap_id: t.client_tap_id, status: "accepted" })),
  });
}

test("the hand-off goes to the Event Service with its key, the station and each owner", async () => {
  const { target, handOffs } = withEventService(acceptEach);
  const { post, uid, stationId, userId } = await harness(target);
  loggedLines();
  await post({
    taps: [
      { client_tap_id: "t1", uid, tapped_at: "2026-10-10T09:00:00+08:00" },
      { client_tap_id: "t2", uid: "DEADBEEF" },
      { client_tap_id: "t3", uid },
    ],
  });
  // Once, to the showcase's entry in EVENT_SERVICES.
  assert.deepEqual(handOffs, [
    {
      url: `${TEST_EVENT_SERVICE_URL}/geekykey/v1/taps`,
      authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      body: {
        station_id: stationId,
        // Not the token nobody owns, and never a UID.
        taps: [
          { client_tap_id: "t1", user_id: userId, tapped_at: "2026-10-10T01:00:00.000Z" },
          { client_tap_id: "t3", user_id: userId, tapped_at: null },
        ],
      },
    },
  ]);
});

test("a tapped_at more than 5 minutes ahead or 7 days behind is handed off as null", async () => {
  const { target, handOffs } = withEventService(acceptEach);
  const { post, uid } = await harness(target);
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  await post({
    taps: [
      { client_tap_id: "ahead", uid, tapped_at: at(6 * 60 * 1000) },
      { client_tap_id: "behind", uid, tapped_at: at(-8 * 24 * 60 * 60 * 1000) },
      { client_tap_id: "never-synced", uid, tapped_at: "1970-01-01T00:00:05Z" },
      { client_tap_id: "a-little-fast", uid, tapped_at: at(60 * 1000) },
    ],
  });
  assert.deepEqual(
    handOffs[0]!.body.taps.map((t) => [t.client_tap_id, t.tapped_at]),
    [
      ["ahead", null],
      ["behind", null],
      ["never-synced", null],
      ["a-little-fast", at(60 * 1000)],
    ],
  );
});

test("a batch of taps nobody owns isn't handed off at all", async () => {
  const { target, handOffs } = withEventService(acceptEach);
  const { post } = await harness(target);
  loggedLines();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: "DEADBEEF" }] });
  assert.equal(res.status, 200);
  assert.deepEqual(handOffs, []);
});

test("another team's own status passes to the station unchanged", async () => {
  const { target } = withEventService(async ({ body }) =>
    Response.json({
      results: body.taps.map((t) => ({ client_tap_id: t.client_tap_id, status: "bingo_line" })),
    }),
  );
  const { post, uid } = await harness(target);
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] });
  const { results } = (await res.json()) as { results: { status: string }[] };
  assert.deepEqual(results, [{ client_tap_id: "t1", status: "bingo_line" }]);
});

test("the station's ID and Event Service come from the registered stations, not the stations table", async () => {
  let registered: RegisteredStation[] = [];
  const listRequests: (string | null)[] = [];
  const { target, handOffs } = withEventService(acceptEach, async (_url, init) => {
    listRequests.push(new Headers(init.headers).get("Authorization"));
    return Response.json({ stations: registered });
  });
  const { post, uid, db, stationId, stationKey } = await harness(target);
  loggedLines();
  // Registered under another ID, and gone from the table.
  registered = [{ station_id: "station-9", key_hash: await hashStationKey(stationKey) }];
  await db.delete(passportStations).where(eq(passportStations.stationId, stationId));
  await db.delete(stations).where(eq(stations.id, stationId));

  for (const id of ["t1", "t2"]) {
    const res = await post({ taps: [{ client_tap_id: id, uid }] });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { station_id: string }).station_id, "station-9");
  }
  assert.deepEqual(
    handOffs.map(({ body }) => body.station_id),
    ["station-9", "station-9"],
  );
  // Asked for once, with the Event Service key, and kept.
  assert.deepEqual(listRequests, [`Bearer ${TEST_EVENT_SERVICE_KEY}`]);
});

for (const [what, stationsAnswer] of [
  ["an answer that never comes", never],
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  [
    "a key instead of its hash",
    async () => Response.json({ stations: [{ station_id: "station-1", key_hash: "gk_sta_abc" }] }),
  ],
] as const) {
  test(`with ${what} for the registered stations, a station's request is 503 event_service_unavailable, not 401`, async () => {
    const { target, handOffs } = withEventService(acceptEach, stationsAnswer);
    const { post, uid } = await harness(target);
    loggedLines();

    const started = Date.now();
    const res = await post({ taps: [{ client_tap_id: "t1", uid }] });
    const took = Date.now() - started;

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
    // Within the deadline, with a little room for the rest of the request.
    assert.ok(took < 1000, `took ${took} ms`);
    assert.deepEqual(handOffs, []);
  });
}

test("registered stations that can't be had are logged, without the key", async () => {
  const { target } = withEventService(acceptEach, async () => new Response("", { status: 503 }));
  const { post, uid } = await harness(target);
  const lines = loggedLines();
  await post({ taps: [{ client_tap_id: "t1", uid }] });
  assert.deepEqual(lines(), [
    {
      severity: "ERROR",
      message: "stations_unavailable",
      event_service: "showcase",
      reason: "status",
      status: 503,
    },
  ]);
});

for (const [what, answer] of [
  ["an answer that never comes", never],
  ["a 500", async () => Response.json({ error: "internal_error" }, { status: 500 })],
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  [
    "a 401, as when the two sides' keys differ",
    async () => Response.json({ error: "invalid_event_service_key" }, { status: 401 }),
  ],
  [
    "a redirect",
    async () => new Response(null, { status: 302, headers: { Location: "https://example.com/" } }),
  ],
  ["a body that isn't JSON", async () => new Response("<html>", { status: 200 })],
  [
    "a status that isn't snake_case",
    async ({ body }: HandOff) =>
      Response.json({
        results: body.taps.map((t) => ({ client_tap_id: t.client_tap_id, status: "Accepted" })),
      }),
  ],
  ["one result short", async () => Response.json({ results: [] })],
  [
    "results in another order",
    async ({ body }: HandOff) =>
      Response.json({
        results: [...body.taps]
          .reverse()
          .map((t) => ({ client_tap_id: t.client_tap_id, status: "accepted" })),
      }),
  ],
] as const) {
  test(`${what} from the Event Service fails the request with 503 event_service_unavailable`, async () => {
    const { target, handOffs } = withEventService(answer);
    const { post, uid, stationId } = await harness(target);
    const lines = loggedLines();

    const started = Date.now();
    const res = await post({
      taps: [
        { client_tap_id: "t1", uid },
        { client_tap_id: "t2", uid },
      ],
    });
    const took = Date.now() - started;

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
    // Within the deadline, with a little room for the rest of the request.
    assert.ok(took < 1000, `took ${took} ms`);
    // Handed off once, and never again.
    assert.equal(handOffs.length, 1);
    const [line, ...rest] = lines();
    assert.deepEqual(rest, []);
    assert.equal(line!.message, "handoff_failed");
    assert.equal(line!.severity, "ERROR");
    assert.equal(line!.station_id, stationId);
    assert.equal(line!.event_service, "showcase");
    assert.doesNotMatch(JSON.stringify(line), /e{64}/);
  });
}

test("the hand-off gets only what's left of the deadline after the owner lookup", async () => {
  // The owners take 180 of the 200 ms, and the Event Service never answers.
  const handOffs: string[] = [];
  const target = testApp(
    { TAP_DEADLINE_MS: "200" },
    {
      sendToClaimsStandIn: async (url, init) => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return testApp().request(url, init);
      },
      sendToEventService: async (url, init) => {
        if (url === STATIONS_URL) return realEventSide(url, init);
        handOffs.push(url);
        return never();
      },
    },
  );
  const { post, uid } = await harness(target);
  loggedLines();
  const started = Date.now();
  const res = await post({ taps: [{ client_tap_id: "t1", uid }] });
  const took = Date.now() - started;
  assert.equal(res.status, 503);
  assert.equal(handOffs.length, 1);
  // A deadline of its own for the hand-off would make it about 380 ms.
  assert.ok(took < 300, `took ${took} ms, more than one deadline`);
});

// The heartbeat: the API agreement's 6.2, and the heartbeat hand-off, 11.3.

/** A heartbeat's answer, which sets the station's clock. */
interface HeartbeatAnswer {
  station_id: string;
  server_time: string;
}

test("a heartbeat gets the time, and its health is on the station's row by then", async () => {
  const { postHeartbeat, stationId, db } = await harness();
  const before = new Date().toISOString();
  const res = await postHeartbeat({ firmware_version: "0.3.1", buffered_taps: 2, reader_ok: true });
  const after = new Date().toISOString();

  assert.equal(res.status, 200);
  const answer = (await res.json()) as HeartbeatAnswer;
  assert.deepEqual(Object.keys(answer).sort(), ["server_time", "station_id"]);
  assert.equal(answer.station_id, stationId);
  // UTC with milliseconds, and now.
  assert.match(answer.server_time, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.ok(before <= answer.server_time && answer.server_time <= after, answer.server_time);

  // Passed on after the answer is made, but done before it leaves: Cloud Run
  // gives the one server a processor only while a request is in progress.
  const [row] = await db
    .select({
      lastSeenAt: stations.lastSeenAt,
      firmwareVersion: stations.firmwareVersion,
      bufferedTaps: stations.bufferedTaps,
      readerOk: stations.readerOk,
    })
    .from(stations)
    .where(eq(stations.id, stationId));
  const { lastSeenAt, ...rest } = row!;
  assert.ok(lastSeenAt! >= before, `${lastSeenAt}`);
  assert.deepEqual(rest, { firmwareVersion: "0.3.1", bufferedTaps: 2, readerOk: true });
});

test("a heartbeat without a key, or with a wrong one, gets 401 and no time", async () => {
  const { postHeartbeat } = await harness();
  loggedLines();
  const missing = await postHeartbeat({}, null);
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { error: "missing_station_key" });
  // Checked before the body, which here is wrong too.
  const wrong = await postHeartbeat({ buffered_taps: -1 }, "gk_sta_not-a-real-key");
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { error: "invalid_station_key" });
});

test("a heartbeat whose key can't be checked gets 503 and no time, and isn't passed on", async () => {
  const { target, handOffs } = withEventService(
    acceptEach,
    async () => new Response("", { status: 503 }),
  );
  const { postHeartbeat } = await harness(target);
  loggedLines();
  const res = await postHeartbeat({ reader_ok: true });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
  assert.deepEqual(handOffs, []);
});

test("a heartbeat with every field left out still sets the clock", async () => {
  const { postHeartbeat, stationId } = await harness();
  const res = await postHeartbeat({});
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as HeartbeatAnswer).station_id, stationId);
});

test("a heartbeat's body is checked once its key is", async () => {
  const { postHeartbeat } = await harness();
  for (const body of [
    { firmware_version: "" },
    { firmware_version: "1".repeat(65) },
    { buffered_taps: -1 },
    { buffered_taps: 1.5 },
    { buffered_taps: 2 ** 31 },
    { reader_ok: "yes" },
    [],
  ]) {
    const res = await postHeartbeat(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
});

test("the heartbeat hand-off goes to the Event Service with its key, the station and only what the station sent", async () => {
  const { target, handOffs } = withEventService(async () => new Response(null, { status: 204 }));
  const { postHeartbeat, stationId } = await harness(target);
  await postHeartbeat({ buffered_taps: 0, reader_ok: false });
  await vi.waitFor(() => assert.equal(handOffs.length, 1));
  assert.deepEqual(handOffs, [
    {
      url: `${TEST_EVENT_SERVICE_URL}/geekykey/v1/heartbeats`,
      authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      body: { station_id: stationId, buffered_taps: 0, reader_ok: false },
    },
  ]);
});

test("the heartbeat hand-off is done before the answer leaves", async () => {
  // Cloud Run gives the one server a processor only while a request is in
  // progress, so work left for after the answer might never finish.
  let handedOff = false;
  const { target } = withEventService(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    handedOff = true;
    return new Response(null, { status: 204 });
  });
  const { postHeartbeat } = await harness(target);
  const res = await postHeartbeat({ reader_ok: true });
  assert.equal(res.status, 200);
  assert.equal(handedOff, true);
});

test("with the Event side down, a heartbeat still gets the time once the deadline is up", async () => {
  const handOffs: string[] = [];
  const target = testApp(
    { TAP_DEADLINE_MS: "300" },
    {
      sendToEventService: async (url, init) => {
        if (url === STATIONS_URL) return realEventSide(url, init);
        handOffs.push(url);
        return never();
      },
    },
  );
  const { postHeartbeat } = await harness(target);
  const lines = loggedLines();
  const started = Date.now();
  const res = await postHeartbeat({ reader_ok: true });
  const took = Date.now() - started;
  assert.equal(res.status, 200);
  assert.ok(((await res.json()) as HeartbeatAnswer).server_time);
  // Never longer than the deadline, with a little room for the rest of the request.
  assert.ok(took < 1000, `took ${took} ms`);
  assert.equal(handOffs.length, 1);
  // Given up on, and logged, before the answer left.
  assert.deepEqual(
    lines().map((line) => [line.message, line.reason]),
    [["heartbeat_handoff_failed", "timeout"]],
  );
});

for (const [what, answer] of [
  ["an answer that never comes", never],
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  [
    "a 401, as when the two sides' keys differ",
    async () => Response.json({ error: "invalid_event_service_key" }, { status: 401 }),
  ],
] as const) {
  test(`${what} to the heartbeat hand-off is logged, once, without the key`, async () => {
    const { target, handOffs } = withEventService(answer);
    const { postHeartbeat, stationId } = await harness(target);
    const lines = loggedLines();
    const res = await postHeartbeat({ reader_ok: true });
    assert.equal(res.status, 200);
    // Within the 200 ms deadline withEventService gives, and not retried.
    await vi.waitFor(() => assert.equal(lines().length, 1));
    assert.equal(handOffs.length, 1);
    const [line] = lines();
    assert.equal(line!.message, "heartbeat_handoff_failed");
    assert.equal(line!.severity, "ERROR");
    assert.equal(line!.station_id, stationId);
    assert.equal(line!.event_service, "showcase");
    assert.doesNotMatch(JSON.stringify(line), /e{64}/);
  });
}
