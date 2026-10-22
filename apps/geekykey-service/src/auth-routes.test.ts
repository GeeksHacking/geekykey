import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle, unreachableGoogleKeys } from "@geekykey/firebase-login/testing";
import { Hono } from "hono";
import { getSignedCookie } from "hono/cookie";
import { onTestFinished, test, vi } from "vitest";
import { fakeServices } from "../test-support/fake-services.ts";
import { type AppDeps, createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// The GeekyKey Service's auth endpoints (the API agreement's 7.1 to 7.3).
// It keeps no users, so dev-login signs in any user ID, and the Firebase
// login any user Google vouches for.

const SESSION_SECRET = "test-session-secret-for-auth";

/** Google, faked: the Worker checks Firebase ID tokens with its keys, for wrangler.jsonc's project. */
const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

/**
 * The Worker as `pnpm dev` starts it, with dev-login on, or as production
 * does, with it off, and a way to post to it as a browser would.
 */
function harness({ devAuth, googleKeys = google.keys }: { devAuth: boolean } & Partial<AppDeps>) {
  const config = loadConfig({
    ...env,
    // As `pnpm dev` passes it. Production leaves it unset.
    ...(devAuth ? { DEV_AUTH_ENABLED: "true" } : {}),
    SESSION_SECRET,
  });
  const app = createApp(config, {
    send: fakeServices(config).send,
    googleKeys,
    stationLimit: env.STATION_LIMIT,
  });
  const post = (path: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, post };
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
  // An expiry in milliseconds, the user ID, and no name, since dev-login has none.
  const { exp, ...rest } = JSON.parse(value) as { exp: number };
  assert.deepEqual(rest, { sub: "dev-user-2", name: null });
  assert.ok(exp > Date.now());
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

/** POST /auth/firebase, as the screens send it after a Firebase sign-in. */
function logIn(idToken: string, { post } = harness({ devAuth: false })) {
  return post("/auth/firebase", { id_token: idToken });
}

test("a good ID token logs its user in as its sub, with a Secure gk_session", async () => {
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^gk_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Domain=/);
  const value = await signedSessionValue(cookie);
  assert.ok(typeof value === "string", "the cookie's signature didn't check out");
  // The token's sub and name, so a login link can carry the name (7.2).
  const { exp, ...rest } = JSON.parse(value) as { exp: number };
  assert.deepEqual(rest, { sub: "firebase-uid-1", name: "Ada Lim" });
  assert.ok(exp > Date.now());
});

test("a guest's token logs them in as its sub, like any other", async () => {
  const res = await logIn(await google.signGuestIdToken("firebase-guest-1"));
  assert.equal(res.status, 204);

  const value = await signedSessionValue(res.headers.get("Set-Cookie") ?? "");
  assert.ok(typeof value === "string", "the cookie's signature didn't check out");
  // A guest's token has no name, so neither does the session.
  const { sub, name } = JSON.parse(value) as { sub: string; name: string | null };
  assert.deepEqual({ sub, name }, { sub: "firebase-guest-1", name: null });
});

test("each token the check refuses gets invalid_token, and no cookie", async () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const forger = await fakeGoogle(env.FIREBASE_PROJECT_ID);
  const refused = {
    "not a token": "not-a-jwt",
    "signed by a key that isn't Google's": await forger.signIdToken({ sub: "firebase-uid-1" }),
    "for another Firebase project": await google.signIdToken({
      sub: "firebase-uid-1",
      aud: "someone-elses-app",
      iss: "https://securetoken.google.com/someone-elses-app",
    }),
    expired: await google.signIdToken({
      sub: "firebase-uid-1",
      iat: nowSeconds - 3700,
      exp: nowSeconds - 100,
    }),
    "for a sign-in still to come": await google.signIdToken({
      sub: "firebase-uid-1",
      auth_time: nowSeconds + 60,
    }),
    "with a user ID longer than 128 characters": await google.signIdToken({ sub: "a".repeat(129) }),
  };
  for (const [what, token] of Object.entries(refused)) {
    const res = await logIn(token);
    assert.equal(res.status, 401, what);
    assert.deepEqual(await res.json(), { error: "invalid_token" }, what);
    assert.equal(res.headers.get("Set-Cookie"), null, what);
  }
});

test("a login while Google's keys can't be fetched gets login_unavailable, not invalid_token, and is logged", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => errors.mockRestore());
  const token = await google.signIdToken({ sub: "firebase-uid-1" });
  const res = await logIn(token, harness({ devAuth: false, googleKeys: unreachableGoogleKeys }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "login_unavailable" });
  assert.equal(res.headers.get("Set-Cookie"), null);

  const lines = errors.mock.calls.map(([line]) => JSON.parse(line as string));
  assert.deepEqual(
    lines.map(({ severity, message, error }) => [severity, message, error]),
    [["ERROR", "login_unavailable", "JWKSTimeout"]],
  );
  // Never the token.
  assert.ok(!errors.mock.calls.flat().join().includes(token));
});

test("a body that isn't JSON with an id_token fails validation, so a form elsewhere can't log anyone in", async () => {
  const { app } = harness({ devAuth: false });
  const idToken = await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" });
  const bodies: [string, string][] = [
    // What a form on another site can send without the browser asking first.
    ["application/x-www-form-urlencoded", new URLSearchParams({ id_token: idToken }).toString()],
    ["text/plain", JSON.stringify({ id_token: idToken })],
    ["application/json", JSON.stringify({})],
    ["application/json", JSON.stringify({ id_token: "" })],
    ["application/json", JSON.stringify({ id_token: 42 })],
  ];
  for (const [contentType, body] of bodies) {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    const what = `${contentType} ${body.slice(0, 40)}`;
    assert.equal(res.status, 400, what);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    assert.equal(json.error, "validation_failed", what);
    assert.ok(json.issues.length > 0, what);
    assert.equal(res.headers.get("Set-Cookie"), null, what);
  }
});
