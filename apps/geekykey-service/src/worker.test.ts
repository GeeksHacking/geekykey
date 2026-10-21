import assert from "node:assert/strict";
import { exports } from "cloudflare:workers";
import { test } from "vitest";

// The Worker as workerd starts it, from src/worker.ts with wrangler.jsonc's
// settings and the tests' stand-in secrets (vitest.config.ts).

test("health says the service is up, with the time", async () => {
  const res = await exports.default.fetch("http://localhost/api/health");
  assert.equal(res.status, 200);
  const { timestamp, ...rest } = (await res.json()) as Record<string, string>;
  assert.deepEqual(rest, { status: "ok", service: "geekykey-service" });
  assert.equal(new Date(timestamp!).toISOString(), timestamp);
});

test("every /api and /auth response says not to cache it, even an error", async () => {
  for (const path of ["/api/health", "/api/v1/nothing-here", "/auth/nothing-here"]) {
    const res = await exports.default.fetch(`http://localhost${path}`);
    assert.equal(res.headers.get("Cache-Control"), "no-store", path);
  }
});

test("unknown routes and methods get the JSON not_found error", async () => {
  for (const [method, path] of [
    ["GET", "/nope"],
    ["GET", "/api/v1/taps"],
    ["GET", "/api/v1/stations/heartbeat"],
  ]) {
    const res = await exports.default.fetch(`http://localhost${path}`, { method });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
});

test("the login and /me are mounted, and need a token and a session", async () => {
  // A body with no id_token fails before Google's keys are needed.
  const login = await exports.default.fetch("http://localhost/auth/firebase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(login.status, 400);
  assert.equal(((await login.json()) as { error: string }).error, "validation_failed");

  const me = await exports.default.fetch("http://localhost/api/v1/me");
  assert.equal(me.status, 401);
  assert.deepEqual(await me.json(), { error: "unauthenticated" });
});
