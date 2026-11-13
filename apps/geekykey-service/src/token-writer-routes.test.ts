import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { issueSession } from "./session.ts";
import { onTestFinished, test, vi } from "vitest";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { fakeServices } from "../test-support/fake-services.ts";
import { fakeStationSockets } from "../test-support/fake-station-sockets.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { hashStationKey } from "./station-keys.ts";

const KEY = `gk_wri_${"0".repeat(64)}`;
const HASH = await hashStationKey(KEY);
const UID = "04E45150324189";
const PATH = "/api/v1/token-writer/tokens";

function harness(hash: unknown = HASH, writerLimit = fakeLimiter(60), claimsDeadlineMs = 4000) {
  const config = loadConfig({ ...env, ...(hash === null ? {} : { TOKEN_WRITER_KEY_HASH: hash }) });
  const fake = fakeServices(config);
  const userLimit = fakeLimiter(60);
  const stationLimit = fakeLimiter(60);
  const app = createApp(config, {
    send: fake.send,
    stationSockets: fakeStationSockets(),
    userLimit,
    stationLimit,
    tokenLimit: fakeLimiter(20),
    writerLimit,
    claimsDeadlineMs,
  });
  const upload = (tokens: unknown, key: string | null = KEY) =>
    app.request(PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify({ tokens }),
    });
  return { app, fake, upload, writerLimit, userLimit, stationLimit };
}

test("the writer uploads a normalised UID with a millisecond UTC write time and counts", async () => {
  const { fake, upload } = harness();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-13T01:00:02.000Z"));
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  const res = await upload([{ uid: "04:e4:51:50:32:41:89", kind: "E", written_ago_ms: 1234 }]);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { new: 1, changed: 0, unchanged: 0, outdated: 0 });
  assert.deepEqual(fake.sent[0]?.body, {
    tokens: [{ uid: UID, kind: "E", written_at: "2026-11-13T01:00:00.766Z" }],
  });
});

test("missing, wrong, station and malformed writer keys are refused before the body is read", async () => {
  const { app, fake, writerLimit } = harness();
  for (const key of [
    null,
    `gk_wri_${"1".repeat(64)}`,
    `gk_sta_${"0".repeat(64)}`,
    `gk_wri_${"A".repeat(64)}`,
    "bad",
  ]) {
    const req = new Request(`https://key.test${PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      },
      body: "not JSON",
    });
    const read = vi.spyOn(req, "json");
    const res = await app.request(req);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthenticated" });
    assert.equal(read.mock.calls.length, 0);
  }
  assert.deepEqual(fake.sent, []);
  assert.deepEqual(writerLimit.keys, []);
});

test("an absent or malformed hash disables uploads without stopping the app", async () => {
  for (const hash of [undefined, "", "bad", "A".repeat(64), 42]) {
    const { app, fake } = harness(hash === undefined ? null : hash);
    const req = new Request(`https://key.test${PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: "bad",
    });
    const read = vi.spyOn(req, "json");
    const res = await app.request(req);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthenticated" });
    assert.equal(read.mock.calls.length, 0);
    assert.deepEqual(fake.sent, []);
  }
});

test("the newest entry of a repeated normalised UID wins, with the last entry winning a tie", async () => {
  const { fake, upload } = harness();
  assert.equal(
    (
      await upload([
        { uid: UID, kind: "A", written_ago_ms: 1 },
        { uid: "04:e4:51:50:32:41:89", kind: "B", written_ago_ms: 0 },
        { uid: UID, kind: "C", written_ago_ms: 1 },
        { uid: UID, kind: "D", written_ago_ms: 0 },
      ])
    ).status,
    200,
  );
  const body = fake.sent[0]?.body as { tokens: { uid: string; kind: string }[] };
  assert.equal(body.tokens.length, 1);
  assert.equal(body.tokens[0]?.kind, "D");
});

test("uploads accept 50 entries and the age bounds, and reject invalid batches whole", async () => {
  const { fake, upload } = harness();
  const batch = Array.from({ length: 50 }, (_, i) => ({
    uid: `04${i.toString(16).padStart(12, "0")}`,
    kind: "E",
    written_ago_ms: i === 0 ? 604800000 : 0,
  }));
  const accepted = await upload(batch);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { new: 50, changed: 0, unchanged: 0, outdated: 0 });
  fake.sent.length = 0;
  for (const tokens of [
    [],
    [...batch, batch[0]],
    [{ ...batch[0], written_ago_ms: -1 }],
    [{ ...batch[0], written_ago_ms: 604800001 }],
    [{ ...batch[0], written_ago_ms: 1.5 }],
    [{ ...batch[0], kind: "e" }],
    [{ ...batch[0], uid: "bad" }],
    [{ uid: UID, kind: "E" }],
  ]) {
    const res = await upload(tokens);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
  assert.deepEqual(fake.sent, []);
});

test("each upload logs its counts without a key and only uses the writer's independent limit", async () => {
  const { upload, fake, writerLimit, userLimit, stationLimit } = harness();
  fake.answers.loadKinds = async () =>
    Response.json({ new: 1, changed: 2, unchanged: 3, outdated: 4 });
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line) => {
    lines.push(String(line));
  });
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  const body = [{ uid: UID, kind: "E", written_ago_ms: 0 }];
  assert.deepEqual(await (await upload(body)).json(), {
    new: 1,
    changed: 2,
    unchanged: 3,
    outdated: 4,
  });
  assert.deepEqual(JSON.parse(lines[0]!), {
    severity: "INFO",
    message: "token_kinds_uploaded",
    new: 1,
    changed: 2,
    unchanged: 3,
    outdated: 4,
  });
  for (let i = 1; i < 60; i++) assert.equal((await upload(body)).status, 200);
  const limited = await upload(body);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.deepEqual(await limited.json(), { error: "rate_limited" });
  assert.equal(
    lines.filter((line) => JSON.parse(line).message === "token_kinds_uploaded").length,
    60,
  );
  assert.ok(
    lines.every(
      (line) => !line.includes(KEY) && !line.includes(HASH) && !line.includes("Authorization"),
    ),
  );
  assert.ok(writerLimit.keys.every((key) => key === HASH));
  assert.deepEqual(userLimit.keys, []);
  assert.deepEqual(stationLimit.keys, []);
});

test("an unanswered or malformed stand-in answer gives claims_unavailable, including the deadline", async () => {
  for (const answer of [
    async () => new Response(null, { status: 500 }),
    async () => Response.json({}),
    async () => new Promise<Response>(() => {}),
  ]) {
    const { fake, upload } = harness(HASH, fakeLimiter(60), 10);
    fake.answers.loadKinds = answer;
    const res = await upload([{ uid: UID, kind: "E", written_ago_ms: 0 }]);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "claims_unavailable" });
  }
});

test("a session alone cannot upload, and the writer key grants no user or station access", async () => {
  const { app, fake } = harness();
  const issuer = new Hono().get("/", async (c) => {
    await issueSession(
      c,
      { userId: "admin-1", name: null },
      { secret: env.SESSION_SECRET, secure: true },
    );
    return c.body(null, 204);
  });
  const cookie = (await issuer.request("/")).headers.get("Set-Cookie")!.split(";")[0]!;
  const sessionOnly = await app.request(PATH, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "bad",
  });
  assert.equal(sessionOnly.status, 401);
  const login = await app.request("/auth/firebase", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.notEqual(login.status, 204);
  // Even if an Event Service mistakenly lists the writer's hash as a station, it is refused.
  fake.stations.set("showcase", [{ station_id: "station-1", key_hash: HASH }]);
  for (const [path, method] of [
    ["/api/v1/me", "GET"],
    ["/api/v1/admin/token-kinds", "GET"],
    ["/api/v1/stations/heartbeat", "POST"],
    ["/api/v1/station-messages", "POST"],
  ]) {
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    assert.equal(res.status, 401, path);
  }
});

test("write times use request arrival before asynchronous key checks and rate limiting", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-13T01:00:02.000Z"));
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  const limit = fakeLimiter(60);
  limit.limit = async () => {
    clock.mockReturnValue(Date.parse("2026-11-13T01:00:05.000Z"));
    return { success: true };
  };
  const { fake, upload } = harness(HASH, limit);
  assert.equal((await upload([{ uid: UID, kind: "E", written_ago_ms: 1234 }])).status, 200);
  assert.deepEqual(fake.sent[0]?.body, {
    tokens: [{ uid: UID, kind: "E", written_at: "2026-11-13T01:00:00.766Z" }],
  });
});
