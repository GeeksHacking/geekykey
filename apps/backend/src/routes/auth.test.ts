import assert from "node:assert/strict";
import { createApp } from "../app.ts";
import type { Config } from "../config.ts";
import { SESSION_COOKIE } from "../middleware/session-auth.ts";
import { setupFixture } from "../test-helpers.ts";

const config: Config = {
  port: 0,
  databaseUrl: ":memory:",
  databaseAuthToken: undefined,
  tapCooldownSeconds: 300,
  maxTapsPerRequest: 3,
  devAuthEnabled: true,
  sessionSecret: "test-secret-at-least-16",
  sessionCookieSecure: false,
};

async function harness(overrides: Partial<Config> = {}) {
  const fx = await setupFixture();
  const app = createApp({ db: fx.db, config: { ...config, ...overrides } });
  const post = (path: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...fx, app, post };
}

Deno.test("dev-login signs in a seeded user and sets the session cookie", async () => {
  const { post, userId } = await harness();
  const res = await post("/auth/dev-login", { user_id: userId });
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

Deno.test("dev-login answers not_found for a user who was never seeded", async () => {
  const { post } = await harness();
  const res = await post("/auth/dev-login", { user_id: "nobody" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  assert.equal(res.headers.get("Set-Cookie"), null);
});

Deno.test("dev-login validates the body", async () => {
  const { post } = await harness();
  for (const body of [{}, { user_id: "" }, { user_id: 7 }]) {
    const res = await post("/auth/dev-login", body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    const json = await res.json();
    assert.equal(json.error, "validation_failed");
    assert.ok(json.issues.length > 0);
  }
});

Deno.test("dev-login does not exist unless dev auth is enabled", async () => {
  const { post, userId } = await harness({ devAuthEnabled: false });
  const res = await post("/auth/dev-login", { user_id: userId });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Set-Cookie"), null);
});

Deno.test("logout clears the cookie, whether or not anyone was signed in", async () => {
  const { post } = await harness();
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=;`));
  assert.match(cookie, /Max-Age=0/);
});

Deno.test("logout stays mounted in production, where dev-login is gone", async () => {
  const { post } = await harness({ devAuthEnabled: false });
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);
});
