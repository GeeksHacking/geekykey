import assert from "node:assert/strict";
import { env, exports } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { test } from "vitest";
import { requestWorker } from "./test-helpers.ts";
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

test("a request gets the settings the Worker started with, and a database of its own", async () => {
  // A route only this test has, to look at what a real route would be handed.
  const worker = createWorkerApp({ ...env, TAP_COOLDOWN_SECONDS: "7" });
  worker.get("/probe", async (c) => {
    const [rows] = await c.var.db.execute(sql`SELECT DATABASE() AS name`);
    return c.json({ rows, tapCooldownSeconds: c.var.config.tapCooldownSeconds });
  });

  const res = await requestWorker(worker, "/probe");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    // Through the Hyperdrive binding, to the tests' own database.
    rows: [{ name: "geekykey_test" }],
    tapCooldownSeconds: 7,
  });
});
