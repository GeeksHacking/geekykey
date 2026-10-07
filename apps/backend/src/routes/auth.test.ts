import assert from "node:assert/strict";
import { test } from "vitest";
import { SESSION_COOKIE } from "../middleware/session-auth.ts";
import { setupFixture, testApp } from "../test-helpers.ts";

/** The backend as `pnpm dev` starts it, with dev-login on. */
const devApp = testApp();

/**
 * The backend as production starts it, where DEV_AUTH_ENABLED isn't true and
 * SESSION_SECRET is set.
 */
const productionApp = testApp({
  DEV_AUTH_ENABLED: "false",
  SESSION_SECRET: "test-secret-at-least-16",
});

/** The fixture, and a way to post to the backend as a browser would. */
async function harness({ production = false } = {}) {
  const fx = await setupFixture();
  const post = (path: string, body?: unknown) =>
    (production ? productionApp : devApp).request(path, {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...fx, post };
}

test("dev-login signs in a seeded user and sets the session cookie", async () => {
  const { post, userId } = await harness();
  const res = await post("/auth/dev-login", { user_id: userId });
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test("dev-login answers not_found for a user who was never seeded", async () => {
  const { post } = await harness();
  const res = await post("/auth/dev-login", { user_id: "nobody" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  assert.equal(res.headers.get("Set-Cookie"), null);
});

test("dev-login validates the body", async () => {
  const { post } = await harness();
  for (const body of [{}, { user_id: "" }, { user_id: 7 }]) {
    const res = await post("/auth/dev-login", body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    assert.equal(json.error, "validation_failed");
    assert.ok(json.issues.length > 0);
  }
});

test("dev-login does not exist unless dev auth is enabled", async () => {
  const { post, userId } = await harness({ production: true });
  const res = await post("/auth/dev-login", { user_id: userId });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  assert.equal(res.headers.get("Set-Cookie"), null);
});

test("logout clears the cookie, whether or not anyone was signed in", async () => {
  const { post } = await harness();
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=;`));
  assert.match(cookie, /Max-Age=0/);
});

test("logout stays mounted in production, where dev-login is gone", async () => {
  const { post } = await harness({ production: true });
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);
});
