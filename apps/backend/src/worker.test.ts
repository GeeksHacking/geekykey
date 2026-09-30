import assert from "node:assert/strict";
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { test } from "vitest";
import { createWorkerApp } from "./worker.ts";

test("health answers with the same body as on Deno", async () => {
  const res = await exports.default.fetch("http://localhost/api/health");
  assert.equal(res.status, 200);

  const { timestamp, ...rest } = await res.json<Record<string, string>>();
  assert.deepEqual(rest, { status: "ok", service: "geekykey-backend" });
  assert.equal(new Date(timestamp!).toISOString(), timestamp);
});

test("every /api and /auth response says not to cache it, even an error", async () => {
  for (const path of ["/api/health", "/api/v1/nothing-here", "/auth/nothing-here"]) {
    const res = await exports.default.fetch(`http://localhost${path}`);
    assert.equal(res.headers.get("Cache-Control"), "no-store", path);
  }
});

test("a request gets its settings and its database from the Worker's environment", async () => {
  // A route only this test has, to look at what a real route would be handed.
  const app = createWorkerApp();
  app.get("/probe", async (c) => {
    const [rows] = await c.var.db.execute(sql`SELECT DATABASE() AS name`);
    return c.json({ rows, devAuthEnabled: c.var.config.devAuthEnabled });
  });

  const ctx = createExecutionContext();
  const res = await app.request("/probe", {}, env, ctx);
  await waitOnExecutionContext(ctx);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    // Through the Hyperdrive binding, to the tests' own database.
    rows: [{ name: "geekykey_test" }],
    // vitest.config.ts sets DEV_AUTH_ENABLED. Without it, this would be false.
    devAuthEnabled: true,
  });
});
