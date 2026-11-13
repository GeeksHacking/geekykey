import { fakeStationSockets } from "../test-support/fake-station-sockets.ts";
import assert from "node:assert/strict";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { onTestFinished, test, vi } from "vitest";
import { fakeServices } from "../test-support/fake-services.ts";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { hashStationKey } from "./station-keys.ts";

const STATION_KEY = "gk_sta_station-1-key";

async function harness(settings: Record<string, unknown> = {}, stationLimit = fakeLimiter(60)) {
  const config = loadConfig({ ...env, ...settings });
  const fake = fakeServices(config);
  fake.stations.set("showcase", [
    { station_id: "station-1", key_hash: await hashStationKey(STATION_KEY) },
  ]);
  const sockets = fakeStationSockets();
  const app = createApp(config, {
    send: fake.send,
    stationSockets: sockets,
    stationLimit,
    userLimit: fakeLimiter(60),
    tokenLimit: fakeLimiter(20),
  });
  const request = async (path: string, init: RequestInit) => {
    const ctx = createExecutionContext();
    const res = await app.request(path, init, env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };
  const socket = (key: string | null = STATION_KEY, upgrade = "websocket") =>
    request("/api/v1/stations/socket", {
      headers: { Upgrade: upgrade, ...(key === null ? {} : { Authorization: `Bearer ${key}` }) },
    });
  const post = (
    body: unknown = { station_id: "station-1", lines: ["Round started!"] },
    key: string | null = config.eventServices[0]!.key,
  ) =>
    request("/api/v1/station-messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { request, socket, post, fake, sockets, config };
}

test("a socket request checks the station key before requiring an upgrade", async () => {
  const { request } = await harness();
  for (const [key, status, error] of [
    [null, 401, "missing_station_key"],
    ["wrong", 401, "invalid_station_key"],
    [STATION_KEY, 426, "upgrade_required"],
  ] as const) {
    const res = await request("/api/v1/stations/socket", {
      headers: key === null ? {} : { Authorization: `Bearer ${key}` },
    });
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), { error });
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
});

test("an authenticated socket upgrade goes to that station, including a mixed-case upgrade", async () => {
  const { socket, sockets } = await harness();
  const res = await socket(STATION_KEY, "WebSocket");
  assert.equal(res.status, 204);
  assert.deepEqual(sockets.opened, ["station-1"]);
  assert.deepEqual(sockets.openedFor, ["showcase"]);
});

test("a disabled station's key is refused", async () => {
  const { socket, fake, sockets } = await harness();
  fake.stations.set("showcase", []);
  const res = await socket();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_station_key" });
  assert.deepEqual(sockets.opened, []);
});

test("a socket upgrade uses the station rate limit before checking its key", async () => {
  const { socket, fake } = await harness({}, fakeLimiter(0));
  const res = await socket("wrong");
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.deepEqual(fake.sent, []);
});

test("a socket upgrade cannot check a key while its station list is unavailable", async () => {
  const { socket, fake } = await harness();
  fake.answers.stations = async () => new Response(null, { status: 503 });
  const res = await socket();
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
});

test("a message checks the Event Service key before reading the body or station list", async () => {
  const { post, fake, sockets } = await harness();
  for (const key of [null, "wrong", STATION_KEY, "e".repeat(63), `${"e".repeat(64)}x`]) {
    const res = await post("{", key);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "invalid_event_service_key" });
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
  assert.deepEqual(fake.sent, []);
  assert.deepEqual(sockets.sent, []);
});

test("a message sends only its frame to the station and answers whether it took it", async () => {
  const { post, sockets } = await harness();
  const countdown = {
    seconds: 27,
    lines: ["Team duels", "3 in, {s}s left"],
    ending: ["Round started!", "Check your phone"],
  };
  sockets.delivered = 1;
  const res = await post({
    station_id: "station-1",
    lines: ["Alex joined", "3 in, 27s left"],
    countdown,
    beep: true,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(sockets.sent, [
    {
      eventServiceId: "showcase",
      stationId: "station-1",
      frame: {
        type: "station_message",
        lines: ["Alex joined", "3 in, 27s left"],
        countdown,
        beep: true,
      },
    },
  ]);
  sockets.delivered = 0;
  assert.deepEqual(await (await post()).json(), { delivered: false });
});

test("invalid lines, countdowns and beep flags fail before sending a station message", async () => {
  const { post, sockets, fake } = await harness();
  for (const fields of [
    { lines: [] },
    { lines: ["1", "2", "3"] },
    { lines: ["x".repeat(17)] },
    { lines: ["hello\n"] },
    { lines: ["café"] },
    { lines: ["Fine"], beep: "true" },
    { lines: ["Fine"], countdown: { seconds: 0, lines: ["{s}s left"], ending: ["Done"] } },
    { lines: ["Fine"], countdown: { seconds: 2, lines: ["{s} {s}"], ending: ["Done"] } },
  ]) {
    const res = await post({ station_id: "station-1", ...fields });
    assert.equal(res.status, 400, JSON.stringify(fields));
    const body = (await res.json()) as { error: string; issues: unknown[] };
    assert.equal(body.error, "validation_failed");
    assert.ok(body.issues.length > 0);
  }
  const malformed = await post("{");
  assert.equal(malformed.status, 400);
  assert.deepEqual(sockets.sent, []);
  assert.deepEqual(fake.sent, []);
});

const TWO_EVENTS = {
  EVENT_SERVICES: [
    { id: "showcase", name: "Showcase", url: "https://showcase.test" },
    { id: "other", name: "Other", url: "https://other.test" },
  ],
  EVENT_SERVICE_KEY_OTHER: "a".repeat(64),
};

test("each Event Service may send to only its own stations, even when it is the second entry", async () => {
  const { post, fake, sockets } = await harness(TWO_EVENTS);
  fake.stations.set("other", [
    { station_id: "station-2", key_hash: await hashStationKey("other-key") },
  ]);
  for (const [station_id, key] of [
    ["station-1", "a".repeat(64)],
    ["station-2", "e".repeat(64)],
    ["disabled", "e".repeat(64)],
  ]) {
    const res = await post({ station_id, lines: ["Hello"] }, key);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: "validation_failed",
      issues: [
        { path: ["station_id"], message: "Station is not registered by this Event Service" },
      ],
    });
  }
  const res = await post({ station_id: "station-2", lines: ["Hello"] }, "a".repeat(64));
  assert.equal(res.status, 200);
  assert.deepEqual(sockets.sent, [
    {
      eventServiceId: "other",
      stationId: "station-2",
      frame: { type: "station_message", lines: ["Hello"] },
    },
  ]);
});

test("only the sender's list is needed and a failed fill is not retried within a minute", async () => {
  const { post, fake } = await harness(TWO_EVENTS);
  fake.answers.stations = async (req) => {
    if (req.url.startsWith("https://other.test")) return new Response(null, { status: 503 });
    return Response.json({ stations: fake.stations.get("showcase") });
  };
  assert.equal((await post()).status, 200);
  for (let i = 0; i < 2; i++) {
    const res = await post(undefined, "a".repeat(64));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
  }
  assert.equal(fake.sent.length, 2);
});

test("a station disabled on a refreshed list can no longer receive messages", async () => {
  let now = Date.now();
  const time = vi.spyOn(Date, "now").mockImplementation(() => now);
  onTestFinished(() => time.mockRestore());
  const { post, fake, sockets } = await harness();
  assert.equal((await post()).status, 200);
  fake.stations.set("showcase", []);
  now += 60_001;
  assert.equal((await post()).status, 400);
  assert.equal(sockets.sent.length, 1);
  assert.equal(fake.sent.length, 2);
});

test("a Durable Object failure is dropped and logged without the key or message", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => errors.mockRestore());
  const { post, sockets } = await harness();
  sockets.send = async () => {
    throw new Error("secret message and key");
  };
  const res = await post();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: false });
  assert.deepEqual(
    errors.mock.calls.map(([line]) => JSON.parse(String(line))),
    [
      {
        severity: "ERROR",
        message: "station_message_failed",
        station_id: "station-1",
        reason: "unreachable",
      },
    ],
  );
});

test("the station list and send share the same deadline", async () => {
  const { post, fake, sockets } = await harness({ TAP_DEADLINE_MS: 80 });
  fake.answers.stations = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return Response.json({ stations: fake.stations.get("showcase") });
  };
  sockets.send = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return 1;
  };
  const res = await post();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: false });
});

test("an unresponsive station list answers 503 within the request deadline", async () => {
  const { post, fake } = await harness({ TAP_DEADLINE_MS: 10 });
  fake.answers.stations = () => new Promise(() => {});
  const res = await post();
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
});

test("the Event Service message route has no station rate limit", async () => {
  const { post } = await harness({}, fakeLimiter(0));
  assert.equal((await post()).status, 200);
});

test("socket authentication refreshes a disabled station before allowing a reconnect", async () => {
  let now = Date.now();
  const time = vi.spyOn(Date, "now").mockImplementation(() => now);
  onTestFinished(() => time.mockRestore());
  const { socket, fake, sockets } = await harness();
  assert.equal((await socket()).status, 204);
  fake.stations.set("showcase", []);
  now += 60_001;
  assert.equal((await socket()).status, 401);
  assert.deepEqual(sockets.opened, ["station-1"]);
});

test("a refresh failure keeps the sender's last good list, as for a tap", async () => {
  let now = Date.now();
  const time = vi.spyOn(Date, "now").mockImplementation(() => now);
  onTestFinished(() => time.mockRestore());
  const { post, fake } = await harness();
  assert.equal((await post()).status, 200);
  fake.answers.stations = async () => new Response(null, { status: 503 });
  now += 60_001;
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
  assert.equal(fake.sent.length, 2);
});
