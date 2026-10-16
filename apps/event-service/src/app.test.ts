import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { onTestFinished, test, vi } from "vitest";
import { testApp } from "./test-helpers.ts";

const app = testApp();

test("health says the service is up, with the time", async () => {
  const res = await app.request("/api/health");
  assert.equal(res.status, 200);

  const { timestamp, ...rest } = (await res.json()) as Record<string, string>;
  assert.deepEqual(rest, { status: "ok", service: "geekykey-backend" });
  assert.equal(new Date(timestamp!).toISOString(), timestamp);
});

test("every /api and /auth response says not to cache it, even an error", async () => {
  for (const path of ["/api/health", "/api/v1/nothing-here", "/auth/nothing-here"]) {
    const res = await app.request(path);
    assert.equal(res.headers.get("Cache-Control"), "no-store", path);
  }
});

test("a request gets the settings the app started with, and its database", async () => {
  // A route only this test has, to look at what a real route would be handed.
  const app = testApp({ TAP_COOLDOWN_SECONDS: "7" });
  app.get("/probe", async (c) => {
    const [rows] = await c.var.db.execute(sql`SELECT DATABASE() AS name`);
    return c.json({ rows, tapCooldownSeconds: c.var.config.tapCooldownSeconds });
  });

  const res = await app.request("/probe");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    rows: [{ name: "geekykey_test" }],
    tapCooldownSeconds: 7,
  });
});

test("an unexpected error answers internal_error, and logs one line without its message", async () => {
  const app = testApp();
  app.get("/api/probe-failure", () => {
    // As a failed query would: its values in the message, mysql2's code on the cause.
    const cause = Object.assign(new Error("Lock wait timeout exceeded"), {
      code: "ER_LOCK_WAIT_TIMEOUT",
    });
    throw new Error("Failed query: params: gk_sta_secret-key, Alex Tan", { cause });
  });
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => logged.mockRestore());

  const res = await app.request("/api/probe-failure");
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal_error" });

  assert.equal(logged.mock.calls.length, 1);
  const [line] = logged.mock.calls[0]!;
  assert.equal(typeof line, "string");
  assert.doesNotMatch(line, /gk_sta_secret-key|Alex Tan|Lock wait/);
  const { stack, ...rest } = JSON.parse(line) as { stack: string[] };
  assert.deepEqual(rest, {
    severity: "ERROR",
    message: "internal_error",
    method: "GET",
    path: "/api/probe-failure",
    error: "Error",
    code: "ER_LOCK_WAIT_TIMEOUT",
  });
  // Where it was thrown, so the line still points at the code.
  assert.match(stack[0]!, /^at .*app\.test\.ts:\d+:\d+/);
});
