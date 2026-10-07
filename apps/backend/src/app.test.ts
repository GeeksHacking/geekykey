import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { test } from "vitest";
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
