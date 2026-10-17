import assert from "node:assert/strict";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { onTestFinished, test, vi } from "vitest";
import {
  fakeServices,
  type HandedOffTap,
  type SentRequest,
} from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { hashStationKey } from "./station-keys.ts";

// The station endpoints (the API agreement's 6.1 and 6.2), with the Event
// Service and the claims stand-in faked behind `fetch`.

const STATION_ID = "station-1";
const STATION_KEY = "gk_sta_station-1-key";
const USER_ID = "user-1";
/** Normalised, and owned by USER_ID. */
const UID = "04A1B2C3D4E5F6";

/**
 * The Worker with wrangler.jsonc's settings, `settings` on top, and its calls
 * out answered by the fakes: one registered station, STATION_ID, and one
 * claimed token, UID. Each test has its own, since a Worker keeps its copy of
 * the registered stations while it runs.
 */
async function harness(settings: Record<string, unknown> = {}) {
  const config = loadConfig({ ...env, ...settings });
  const fake = fakeServices(config);
  fake.stations.set("showcase", [
    { station_id: STATION_ID, key_hash: await hashStationKey(STATION_KEY) },
  ]);
  fake.owners.set(UID, USER_ID);
  const app = createApp(config, { send: fake.send });

  // Each request's ExecutionContext, to wait on what it left running.
  const contexts: ExecutionContext[] = [];
  const request = async (path: string, body: unknown, key: string | null) => {
    const ctx = createExecutionContext();
    contexts.push(ctx);
    return await app.request(
      path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      env,
      ctx,
    );
  };
  const post = (body: unknown, key: string | null = STATION_KEY) =>
    request("/api/v1/taps", body, key);
  const postHeartbeat = (body: unknown, key: string | null = STATION_KEY) =>
    request("/api/v1/stations/heartbeat", body, key);
  /** Waits for the work every request so far left for after its answer. */
  const settled = () => Promise.all(contexts.map((ctx) => waitOnExecutionContext(ctx)));
  /** The requests sent to `path` on the showcase, or on the stand-in. */
  const sentTo = (path: string) => fake.sent.filter((sent) => sent.url.endsWith(path));
  return { config, fake, post, postHeartbeat, settled, sentTo };
}

/** Every line logged during this test, each read as one JSON object, apart from the copy's fills. */
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

interface TapsAnswer {
  station_id: string;
  results: { client_tap_id: string; status: string }[];
}

interface HeartbeatAnswer {
  station_id: string;
  server_time: string;
}

const never = () => new Promise<Response>(() => {});

// Each status a station can hear.

for (const status of ["accepted", "cooldown", "no_game", "duplicate"]) {
  test(`a tap the Event Service answers ${status} is ${status} at the station`, async () => {
    const { fake, post } = await harness();
    loggedLines();
    fake.statusOf = () => status;
    const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] });
    assert.equal(res.status, 200);
    // Without user details: readers must not hold any.
    assert.deepEqual(await res.json(), {
      station_id: STATION_ID,
      results: [{ client_tap_id: "t1", status }],
    });
  });
}

test("a tap by a token nobody owns is unknown_token, logged, and not handed off", async () => {
  const { post, sentTo } = await harness();
  const lines = loggedLines();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: "DE:AD:BE:EF" }] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    station_id: STATION_ID,
    results: [{ client_tap_id: "t1", status: "unknown_token" }],
  });
  assert.deepEqual(sentTo("/geekykey/v1/taps"), []);
  assert.deepEqual(lines(), [
    {
      severity: "INFO",
      message: "unknown_token",
      station_id: STATION_ID,
      client_tap_id: "t1",
      uid: "DEADBEEF",
    },
  ]);
});

test("a request without a station key is 401 missing_station_key", async () => {
  const { post } = await harness();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] }, null);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "missing_station_key" });
});

test("a key on no Event Service's registered stations is 401 invalid_station_key", async () => {
  const { post, sentTo } = await harness();
  loggedLines();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] }, "gk_sta_not-a-real-key");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_station_key" });
  assert.deepEqual(sentTo("/owners"), []);
});

test("a body that fails validation is 400 validation_failed", async () => {
  const { post } = await harness();
  for (const body of [
    {},
    { taps: [] },
    { taps: [{ uid: UID }] },
    { taps: [{ client_tap_id: "t1", uid: "zz" }] },
    { taps: [{ client_tap_id: "t1", uid: UID, tapped_at: "yesterday" }] },
    // One more than MAX_TAPS_PER_REQUEST allows.
    { taps: Array.from({ length: 501 }, (_, i) => ({ client_tap_id: `t${i}`, uid: UID })) },
    // Not JSON at all: a station that retried this as a 5xx would resend it forever.
    '{"taps":[{',
  ]) {
    const res = await post(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 80)}`);
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
});

// The claims stand-in, as it might fail.

for (const [what, answer] of [
  ["an answer that never comes", never],
  ["a 500", async () => Response.json({ error: "internal_error" }, { status: 500 })],
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  ["a 429", async () => new Response("Too Many Requests", { status: 429 })],
  [
    "a redirect",
    async () => new Response(null, { status: 302, headers: { Location: "https://example.com/" } }),
  ],
  ["a body that isn't JSON", async () => new Response("<html>", { status: 200 })],
  ["a body of the wrong shape", async () => Response.json({ owners: [{ uid: UID }] })],
] as const) {
  test(`${what} from the claims stand-in is 503 claims_unavailable`, async () => {
    const { fake, post, sentTo } = await harness({ TAP_DEADLINE_MS: 200 });
    const lines = loggedLines();
    fake.answers.owners = answer;

    const started = Date.now();
    const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] });
    const took = Date.now() - started;

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "claims_unavailable" });
    // Within the deadline, with a little room for the rest of the request.
    assert.ok(took < 1000, `took ${took} ms`);
    // Asked once, never again, and nothing handed off.
    assert.equal(sentTo("/owners").length, 1);
    assert.deepEqual(sentTo("/geekykey/v1/taps"), []);
    const [line, ...rest] = lines();
    assert.deepEqual(rest, []);
    assert.equal(line!.message, "claims_unavailable");
    assert.equal(line!.severity, "ERROR");
    assert.equal(line!.station_id, STATION_ID);
  });
}

test("the owners are asked for with the stand-in's key, once for each UID", async () => {
  const { config, post, sentTo } = await harness();
  loggedLines();
  await post({
    taps: [
      { client_tap_id: "t1", uid: UID },
      { client_tap_id: "t2", uid: "deadbeef" },
      { client_tap_id: "t3", uid: "04:a1:b2:c3:d4:e5:f6" },
    ],
  });
  assert.deepEqual(sentTo("/owners"), [
    {
      method: "POST",
      url: `${config.claimsStandIn.url}/owners`,
      authorization: `Bearer ${config.claimsStandIn.key}`,
      redirect: "manual",
      body: { uids: [UID, "DEADBEEF"] },
    },
  ]);
});

// The hand-off.

test("the hand-off goes to the Event Service with its key, the station and each owner", async () => {
  const { config, post, sentTo } = await harness();
  // An hour ago, as a station 8 hours ahead of UTC writes it, so the tap is
  // always inside the 7 days a tapped_at is kept for.
  const tappedAt = new Date(Math.floor(Date.now() / 1000) * 1000 - 60 * 60 * 1000);
  const tappedAtPlus8 = `${new Date(tappedAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19)}+08:00`;
  loggedLines();
  await post({
    taps: [
      { client_tap_id: "t1", uid: UID, tapped_at: tappedAtPlus8 },
      { client_tap_id: "t2", uid: "DEADBEEF" },
      { client_tap_id: "t3", uid: UID },
    ],
  });
  const [showcase] = config.eventServices;
  assert.deepEqual(sentTo("/geekykey/v1/taps"), [
    {
      method: "POST",
      url: `${showcase!.url}/geekykey/v1/taps`,
      authorization: `Bearer ${showcase!.key}`,
      // Never followed: a redirect would carry the key wherever it points.
      redirect: "manual",
      body: {
        station_id: STATION_ID,
        // Not the token nobody owns, and never a UID.
        taps: [
          { client_tap_id: "t1", user_id: USER_ID, tapped_at: tappedAt.toISOString() },
          { client_tap_id: "t3", user_id: USER_ID, tapped_at: null },
        ],
      },
    },
  ]);
});

test("a batch mixing claimed and unclaimed tokens gets its statuses in request order", async () => {
  const { fake, post } = await harness();
  loggedLines();
  fake.statusOf = (tap) => (tap.client_tap_id === "b" ? "accepted" : "cooldown");
  const res = await post({
    taps: [
      { client_tap_id: "a", uid: "DEADBEEF" },
      { client_tap_id: "b", uid: UID },
      { client_tap_id: "c", uid: "CAFEF00D" },
      { client_tap_id: "d", uid: UID },
    ],
  });
  assert.deepEqual(((await res.json()) as TapsAnswer).results, [
    { client_tap_id: "a", status: "unknown_token" },
    { client_tap_id: "b", status: "accepted" },
    { client_tap_id: "c", status: "unknown_token" },
    { client_tap_id: "d", status: "cooldown" },
  ]);
});

test("a full batch of 500 taps is handed off in one call", async () => {
  const { post, sentTo } = await harness();
  const res = await post({
    taps: Array.from({ length: 500 }, (_, i) => ({ client_tap_id: `t${i}`, uid: UID })),
  });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as TapsAnswer).results.length, 500);
  const handOffs = sentTo("/geekykey/v1/taps");
  assert.equal(handOffs.length, 1);
  assert.equal((handOffs[0]!.body as { taps: HandedOffTap[] }).taps.length, 500);
});

test("a tapped_at more than 5 minutes ahead or 7 days behind is handed off as null", async () => {
  const { post, sentTo } = await harness();
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  await post({
    taps: [
      { client_tap_id: "ahead", uid: UID, tapped_at: at(6 * 60 * 1000) },
      { client_tap_id: "behind", uid: UID, tapped_at: at(-8 * 24 * 60 * 60 * 1000) },
      { client_tap_id: "never-synced", uid: UID, tapped_at: "1970-01-01T00:00:05Z" },
      { client_tap_id: "a-little-fast", uid: UID, tapped_at: at(60 * 1000) },
    ],
  });
  const [handOff] = sentTo("/geekykey/v1/taps");
  assert.deepEqual(
    (handOff!.body as { taps: HandedOffTap[] }).taps.map((t) => [t.client_tap_id, t.tapped_at]),
    [
      ["ahead", null],
      ["behind", null],
      ["never-synced", null],
      ["a-little-fast", at(60 * 1000)],
    ],
  );
});

test("another team's own status passes to the station unchanged", async () => {
  const { fake, post } = await harness();
  fake.statusOf = () => "bingo_line";
  const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] });
  assert.deepEqual(((await res.json()) as TapsAnswer).results, [
    { client_tap_id: "t1", status: "bingo_line" },
  ]);
});

test("the registered stations are asked for once, with the Event Service key, and kept", async () => {
  const { config, post, sentTo } = await harness();
  loggedLines();
  for (const id of ["t1", "t2"]) {
    const res = await post({ taps: [{ client_tap_id: id, uid: UID }] });
    assert.equal(res.status, 200);
  }
  const [showcase] = config.eventServices;
  assert.deepEqual(sentTo("/geekykey/v1/stations"), [
    {
      method: "GET",
      url: `${showcase!.url}/geekykey/v1/stations`,
      authorization: `Bearer ${showcase!.key}`,
      redirect: "manual",
      body: undefined,
    },
  ]);
});

for (const [what, answer] of [
  ["an answer that never comes", never],
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  [
    "a key instead of its hash",
    async () => Response.json({ stations: [{ station_id: STATION_ID, key_hash: STATION_KEY }] }),
  ],
] as const) {
  test(`with ${what} for the registered stations, a tap is 503 event_service_unavailable, not 401`, async () => {
    const { fake, post, settled, sentTo } = await harness({ TAP_DEADLINE_MS: 200 });
    loggedLines();
    fake.answers.stations = answer;

    const started = Date.now();
    const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] });
    const took = Date.now() - started;

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
    assert.ok(took < 1000, `took ${took} ms`);
    assert.deepEqual(sentTo("/geekykey/v1/taps"), []);
    // The request for the list carries on after the answer, until it gives up.
    await settled();
  });
}

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
    async ({ body }: SentRequest) =>
      Response.json({
        results: (body as { taps: HandedOffTap[] }).taps.map((t) => ({
          client_tap_id: t.client_tap_id,
          status: "Accepted",
        })),
      }),
  ],
  ["one result short", async () => Response.json({ results: [] })],
  [
    "results in another order",
    async ({ body }: SentRequest) =>
      Response.json({
        results: [...(body as { taps: HandedOffTap[] }).taps]
          .reverse()
          .map((t) => ({ client_tap_id: t.client_tap_id, status: "accepted" })),
      }),
  ],
] as const) {
  test(`${what} from the Event Service's hand-off is 503 event_service_unavailable`, async () => {
    const { fake, post, sentTo } = await harness({ TAP_DEADLINE_MS: 200 });
    const lines = loggedLines();
    fake.answers.taps = answer;

    const started = Date.now();
    const res = await post({
      taps: [
        { client_tap_id: "t1", uid: UID },
        { client_tap_id: "t2", uid: UID },
      ],
    });
    const took = Date.now() - started;

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
    assert.ok(took < 1000, `took ${took} ms`);
    // Handed off once, and never again.
    assert.equal(sentTo("/geekykey/v1/taps").length, 1);
    const [line, ...rest] = lines();
    assert.deepEqual(rest, []);
    assert.equal(line!.message, "handoff_failed");
    assert.equal(line!.severity, "ERROR");
    assert.equal(line!.station_id, STATION_ID);
    assert.equal(line!.event_service, "showcase");
    assert.doesNotMatch(JSON.stringify(line), /e{64}/);
  });
}

test("the hand-off gets only what's left of the deadline after the owner lookup", async () => {
  // The owners take 180 of the 200 ms, and the Event Service never answers.
  const { fake, post, sentTo } = await harness({ TAP_DEADLINE_MS: 200 });
  loggedLines();
  fake.answers.owners = async () => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return Response.json({ owners: [{ uid: UID, user_id: USER_ID }] });
  };
  fake.answers.taps = never;
  const started = Date.now();
  const res = await post({ taps: [{ client_tap_id: "t1", uid: UID }] });
  const took = Date.now() - started;
  assert.equal(res.status, 503);
  assert.equal(sentTo("/geekykey/v1/taps").length, 1);
  // A deadline of its own for the hand-off would make it about 380 ms.
  assert.ok(took < 300, `took ${took} ms, more than one deadline`);
});

// The heartbeat: the API agreement's 6.2, and the heartbeat hand-off, 11.3.

test("a heartbeat gets the time, then is handed off with the Event Service key and only what the station sent", async () => {
  const { config, postHeartbeat, settled, sentTo } = await harness();
  const before = new Date().toISOString();
  const res = await postHeartbeat({ buffered_taps: 0, reader_ok: false });
  const after = new Date().toISOString();

  assert.equal(res.status, 200);
  const answer = (await res.json()) as HeartbeatAnswer;
  assert.deepEqual(Object.keys(answer).sort(), ["server_time", "station_id"]);
  assert.equal(answer.station_id, STATION_ID);
  // UTC with milliseconds, and now.
  assert.match(answer.server_time, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.ok(before <= answer.server_time && answer.server_time <= after, answer.server_time);

  await settled();
  const [showcase] = config.eventServices;
  assert.deepEqual(sentTo("/geekykey/v1/heartbeats"), [
    {
      method: "POST",
      url: `${showcase!.url}/geekykey/v1/heartbeats`,
      authorization: `Bearer ${showcase!.key}`,
      redirect: "manual",
      body: { station_id: STATION_ID, buffered_taps: 0, reader_ok: false },
    },
  ]);
});

test("a heartbeat's answer doesn't wait for the hand-off", async () => {
  const { fake, postHeartbeat, settled } = await harness();
  let handedOff = false;
  fake.answers.heartbeats = async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    handedOff = true;
    return new Response(null, { status: 204 });
  };
  const started = Date.now();
  const res = await postHeartbeat({ reader_ok: true });
  const took = Date.now() - started;
  assert.equal(res.status, 200);
  assert.equal(handedOff, false);
  assert.ok(took < 200, `took ${took} ms`);
  // Still done after the answer has gone.
  await settled();
  assert.equal(handedOff, true);
});

test("with the Event Service down, a heartbeat still gets the time at once, and the hand-off gives up at the deadline", async () => {
  const { fake, postHeartbeat, settled, sentTo } = await harness({ TAP_DEADLINE_MS: 300 });
  const lines = loggedLines();
  fake.answers.heartbeats = never;
  const started = Date.now();
  const res = await postHeartbeat({ reader_ok: true });
  assert.equal(res.status, 200);
  assert.ok(((await res.json()) as HeartbeatAnswer).server_time);
  assert.ok(Date.now() - started < 300, `took ${Date.now() - started} ms`);

  await settled();
  const took = Date.now() - started;
  assert.ok(took >= 290 && took < 1000, `gave up after ${took} ms`);
  assert.equal(sentTo("/geekykey/v1/heartbeats").length, 1);
  assert.deepEqual(
    lines().map((line) => [line.message, line.reason]),
    [["heartbeat_handoff_failed", "timeout"]],
  );
});

for (const [what, answer] of [
  ["a 503", async () => new Response("Service Unavailable", { status: 503 })],
  [
    "a 401, as when the two sides' keys differ",
    async () => Response.json({ error: "invalid_event_service_key" }, { status: 401 }),
  ],
] as const) {
  test(`${what} to the heartbeat hand-off is logged, once, without the key`, async () => {
    const { fake, postHeartbeat, settled, sentTo } = await harness();
    const lines = loggedLines();
    fake.answers.heartbeats = answer;
    const res = await postHeartbeat({ reader_ok: true });
    assert.equal(res.status, 200);
    await settled();
    assert.equal(sentTo("/geekykey/v1/heartbeats").length, 1);
    const [line, ...rest] = lines();
    assert.deepEqual(rest, []);
    assert.equal(line!.message, "heartbeat_handoff_failed");
    assert.equal(line!.severity, "ERROR");
    assert.equal(line!.station_id, STATION_ID);
    assert.equal(line!.event_service, "showcase");
    assert.doesNotMatch(JSON.stringify(line), /e{64}/);
  });
}

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

test("a heartbeat whose key can't be checked gets 503 and no time, and isn't handed off", async () => {
  const { fake, postHeartbeat, settled, sentTo } = await harness();
  loggedLines();
  fake.answers.stations = async () => new Response("", { status: 503 });
  const res = await postHeartbeat({ reader_ok: true });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
  await settled();
  assert.deepEqual(sentTo("/geekykey/v1/heartbeats"), []);
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
