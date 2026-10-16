import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { getSignedCookie } from "hono/cookie";
import { test } from "vitest";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// The GeekyKey Service's auth endpoints (the API agreement's 7.1 and 7.3).
// It keeps no users, so dev-login signs in any user ID.

const SESSION_SECRET = "test-session-secret-for-auth";

/**
 * The Worker as `pnpm dev` starts it, with dev-login on, or as production
 * does, with it off, and a way to post to it as a browser would.
 */
function harness({ devAuth }: { devAuth: boolean }) {
  const config = loadConfig({
    ...env,
    // As `pnpm dev` passes it. Production leaves it unset.
    ...(devAuth ? { DEV_AUTH_ENABLED: "true" } : {}),
    SESSION_SECRET,
  });
  const app = createApp(config, { send: fakeServices(config).send });
  const post = (path: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { post };
}

/**
 * What the gk_session in a Set-Cookie header holds, once its signature checks
 * out with SESSION_SECRET. False when it doesn't, undefined when there's none.
 */
async function signedSessionValue(setCookie: string): Promise<string | false | undefined> {
  // Only the name=value pair travels back, the way a browser sends it.
  const cookie = setCookie.split(";")[0]!;
  const reader = new Hono().get("/", async (c) =>
    c.json({ value: await getSignedCookie(c, SESSION_SECRET, "gk_session") }),
  );
  const res = await reader.request("/", { headers: { Cookie: cookie } });
  return ((await res.json()) as { value: string | false | undefined }).value;
}

test("dev-login signs in any user ID and sets gk_session", async () => {
  const { post } = harness({ devAuth: true });
  // Nobody seeded anyone: the GeekyKey Service keeps no users.
  const res = await post("/auth/dev-login", { user_id: "someone-new" });
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^gk_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
  // Locally the screens are on http://localhost, where a Secure cookie never comes back.
  assert.doesNotMatch(cookie, /Secure/);
});

test("the session dev-login sets is signed with SESSION_SECRET, and names the user", async () => {
  const { post } = harness({ devAuth: true });
  const res = await post("/auth/dev-login", { user_id: "dev-user-2" });
  const value = await signedSessionValue(res.headers.get("Set-Cookie") ?? "");
  assert.ok(typeof value === "string", "the cookie's signature didn't check out");
  // `expiry:userId`, as the Event Service's session holds it.
  const separator = value.indexOf(":");
  const [expiresAt, userId] = [value.slice(0, separator), value.slice(separator + 1)];
  assert.equal(userId, "dev-user-2");
  assert.ok(Number(expiresAt) > Date.now());
});

test("dev-login validates the body", async () => {
  const { post } = harness({ devAuth: true });
  for (const body of [{}, { user_id: "" }, { user_id: 7 }, { user_id: "x".repeat(129) }]) {
    const res = await post("/auth/dev-login", body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    assert.equal(json.error, "validation_failed");
    assert.ok(json.issues.length > 0);
    assert.equal(res.headers.get("Set-Cookie"), null);
  }
});

test("dev-login does not exist unless DEV_AUTH_ENABLED is true", async () => {
  const { post } = harness({ devAuth: false });
  const res = await post("/auth/dev-login", { user_id: "dev-user-1" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  assert.equal(res.headers.get("Set-Cookie"), null);
});

test("logout clears gk_session, whether or not anyone was signed in", async () => {
  const { post } = harness({ devAuth: true });
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^gk_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\//);
});

test("logout stays mounted in production, where dev-login is gone, and clears a Secure cookie", async () => {
  const { post } = harness({ devAuth: false });
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^gk_session=;/);
  assert.match(cookie, /Secure/);
});
