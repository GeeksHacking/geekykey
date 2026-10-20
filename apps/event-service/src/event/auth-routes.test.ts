import assert from "node:assert/strict";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { test } from "vitest";
import { setupFixture, TEST_FIREBASE_PROJECT_ID, testApp } from "../test-helpers.ts";

/** The backend as `pnpm dev` starts it, with dev-login on. */
const devApp = testApp();

/** Google, faked: the backend checks Firebase ID tokens with its keys. */
const google = await fakeGoogle(TEST_FIREBASE_PROJECT_ID);

/** Production's settings: DEV_AUTH_ENABLED isn't true, and SESSION_SECRET is set. */
const PRODUCTION_SETTINGS = {
  DEV_AUTH_ENABLED: "false",
  SESSION_SECRET: "test-secret-at-least-16",
};

/** The backend as production starts it, with Google faked. */
const productionApp = testApp(PRODUCTION_SETTINGS, { googleKeys: google.keys });

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

test("dev-login signs in a seeded user and sets event_session", async () => {
  const { post, userId } = await harness();
  const res = await post("/auth/dev-login", { user_id: userId });
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^event_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
});

test("the cookie dev-login sets is what /me reads, and gk_session is not", async () => {
  const { post, userId } = await harness();
  const res = await post("/auth/dev-login", { user_id: userId });
  // Only the name=value pair travels back, the way a browser sends it.
  const cookie = (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  const value = cookie.slice(cookie.indexOf("=") + 1);

  const me = await devApp.request("/api/v1/me", { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { user: { id: string } }).user.id, userId);

  // The GeekyKey Service's cookie, which shares localhost with this one, signs nobody in here.
  const other = await devApp.request("/api/v1/me", {
    headers: { Cookie: `gk_session=${value}` },
  });
  assert.equal(other.status, 401);
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

test("logout clears event_session, whether or not anyone was signed in", async () => {
  const { post } = await harness();
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^event_session=;/);
  assert.match(cookie, /Max-Age=0/);
});

test("logout stays mounted in production, where dev-login is gone", async () => {
  const { post } = await harness({ production: true });
  const res = await post("/auth/logout");
  assert.equal(res.status, 204);
});

/** POST /auth/firebase, as the screens send it after a Firebase sign-in. */
function logIn(idToken: string, app = productionApp) {
  return app.request("/auth/firebase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
}

/** Who GET /api/v1/me says is behind the cookie a login set. */
async function me(login: Response) {
  // Only the name=value pair travels back, the way a browser sends it.
  const cookie = (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  const res = await productionApp.request("/api/v1/me", { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { user: { id: string; display_name: string } }).user;
}

test("a new user's good token logs them in as its sub, with the token's name", async () => {
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  assert.equal(res.status, 204);

  const cookie = res.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /^event_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.deepEqual(await me(res), {
    id: "firebase-uid-1",
    display_name: "Ada Lim",
    role: "participant",
  });
});

test("a returning user's login updates their name to the token's", async () => {
  await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada" }));
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  assert.equal(res.status, 204);
  assert.equal((await me(res)).display_name, "Ada Lim");
});

test("a token with no name keeps a returning user's name", async () => {
  await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1" }));
  assert.equal(res.status, 204);
  assert.equal((await me(res)).display_name, "Ada Lim");
});

test("a token with no name gives a new user the name GeeksHacking member", async () => {
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1" }));
  assert.equal(res.status, 204);
  assert.deepEqual(await me(res), {
    id: "firebase-uid-1",
    display_name: "GeeksHacking member",
    role: "participant",
  });
});

test("each token the check refuses gets invalid_token, and no cookie", async () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const forger = await fakeGoogle(TEST_FIREBASE_PROJECT_ID);
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

test("a login while Google's keys can't be fetched gets login_unavailable, not invalid_token", async () => {
  // testApp() fakes Google's keys as unreachable unless it's given some.
  const unreachable = testApp(PRODUCTION_SETTINGS);
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1" }), unreachable);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "login_unavailable" });
  assert.equal(res.headers.get("Set-Cookie"), null);
});

test("a body that isn't JSON with an id_token fails validation, so a form elsewhere can't log anyone in", async () => {
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
    const res = await productionApp.request("/auth/firebase", {
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
