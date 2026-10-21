import assert from "node:assert/strict";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { loginLinks } from "@geekykey/login-link";
import { onTestFinished, test, vi } from "vitest";
import {
  setupFixture,
  TEST_EVENT_SERVICE_KEY,
  TEST_FIREBASE_PROJECT_ID,
  testApp,
} from "../test-helpers.ts";

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
  const cookie = sessionCookie(res);
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

/** The cookie a login set, as a browser sends it back: only the name=value pair. */
function sessionCookie(login: Response) {
  return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
}

/** PATCH /api/v1/me, with the cookie a login set. */
function setName(login: Response, displayName: string) {
  return productionApp.request("/api/v1/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie(login) },
    body: JSON.stringify({ display_name: displayName }),
  });
}

/** Who GET /api/v1/me says is behind the cookie a login set. */
async function me(login: Response) {
  const res = await productionApp.request("/api/v1/me", {
    headers: { Cookie: sessionCookie(login) },
  });
  assert.equal(res.status, 200);
  return ((await res.json()) as { user: { id: string; display_name: string; has_name: boolean } })
    .user;
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
    has_name: true,
  });
});

test("a returning user's login updates their name to the token's", async () => {
  await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada" }));
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  assert.equal(res.status, 204);
  assert.equal((await me(res)).display_name, "Ada Lim");
});

test("a login never replaces a name the user set", async () => {
  const first = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  assert.equal((await setName(first, "Ada")).status, 200);

  const again = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Tan" }));
  assert.equal(again.status, 204);
  assert.equal((await me(again)).display_name, "Ada");
  const nameless = await logIn(await google.signIdToken({ sub: "firebase-uid-1" }));
  assert.equal((await me(nameless)).display_name, "Ada");
});

test("a token with no name keeps a returning user's name", async () => {
  await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1" }));
  assert.equal(res.status, 204);
  assert.equal((await me(res)).display_name, "Ada Lim");
});

test("a token with no name gives a new user the name Guest, and no name of their own", async () => {
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1" }));
  assert.equal(res.status, 204);
  assert.deepEqual(await me(res), {
    id: "firebase-uid-1",
    display_name: "Guest",
    role: "participant",
    has_name: false,
  });
});

test("a later login with a name replaces the default name", async () => {
  await logIn(await google.signIdToken({ sub: "firebase-uid-1" }));
  const res = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  assert.deepEqual(await me(res), {
    id: "firebase-uid-1",
    display_name: "Ada Lim",
    role: "participant",
    has_name: true,
  });
});

test("a guest who sets their name has one", async () => {
  const login = await logIn(await google.signGuestIdToken("firebase-guest-1"));
  const patch = await setName(login, "Ally");
  assert.equal(patch.status, 200);
  assert.deepEqual(await me(login), {
    id: "firebase-guest-1",
    display_name: "Ally",
    role: "participant",
    has_name: true,
  });
});

test("a user who sets the name Guest has a name, so the passport stops asking", async () => {
  const login = await logIn(await google.signGuestIdToken("firebase-guest-1"));
  await setName(login, "Guest");
  assert.equal((await me(login)).has_name, true);
});

test("a guest's token logs them in as its sub, like any other with no name", async () => {
  const res = await logIn(await google.signGuestIdToken("firebase-guest-1"));
  assert.equal(res.status, 204);
  assert.match(res.headers.get("Set-Cookie") ?? "", /^event_session=/);
  assert.deepEqual(await me(res), {
    id: "firebase-guest-1",
    display_name: "Guest",
    role: "participant",
    has_name: false,
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

// POST /auth/login-link (the API agreement's 7.4): a login link from the
// GeekyKey Service, made here with the same package and testApp()'s Event
// Service key, as the GeekyKey Service makes them.

/** Login links as the GeekyKey Service makes them for this Event Service. */
const links = loginLinks(TEST_EVENT_SERVICE_KEY);

/** A fresh link for `userId`, with the name their login on the GeekyKey screens had. */
async function linkFor(userId: string, name: string | null = null) {
  return (await links.make({ userId, name })).link;
}

/** POST /auth/login-link, as the Event screens send the link from their address's fragment. */
function useLink(link: string, { cookie }: { cookie?: string } = {}) {
  return productionApp.request("/auth/login-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ login_link: link }),
  });
}

test("a login link logs its user in, with the name their login had", async () => {
  const res = await useLink(await linkFor("firebase-uid-1", "Ada Lim"));
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
    has_name: true,
  });
});

test("a guest's login link logs them in as Guest, with no name of their own", async () => {
  const res = await useLink(await linkFor("firebase-guest-1"));
  assert.equal(res.status, 204);
  assert.deepEqual(await me(res), {
    id: "firebase-guest-1",
    display_name: "Guest",
    role: "participant",
    has_name: false,
  });
});

test("a login link takes a name as a login does: never over one the user set", async () => {
  const first = await useLink(await linkFor("firebase-uid-1", "Ada"));
  assert.equal(
    (await me(await useLink(await linkFor("firebase-uid-1", "Ada Lim")))).display_name,
    "Ada Lim",
  );
  assert.equal((await me(await useLink(await linkFor("firebase-uid-1")))).display_name, "Ada Lim");

  assert.equal((await setName(first, "Ally")).status, 200);
  const again = await useLink(await linkFor("firebase-uid-1", "Ada Tan"));
  assert.equal(again.status, 204);
  assert.equal((await me(again)).display_name, "Ally");
});

test("a login link works once", async () => {
  const link = await linkFor("firebase-uid-1", "Ada Lim");
  assert.equal((await useLink(link)).status, 204);

  const again = await useLink(link);
  assert.equal(again.status, 401);
  assert.deepEqual(await again.json(), { error: "invalid_login_link" });
  assert.equal(again.headers.get("Set-Cookie"), null);
});

test("a login link sent twice at once logs in only one of them", async () => {
  const link = await linkFor("firebase-uid-1", "Ada Lim");
  const answers = await Promise.all([useLink(link), useLink(link), useLink(link)]);
  assert.deepEqual(answers.map(({ status }) => status).sort(), [204, 401, 401]);
});

test("an expired, changed or other Event Service's link gets invalid_login_link, and no cookie", async () => {
  const good = await linkFor("firebase-uid-1", "Ada Lim");
  const [body, signature] = good.split(".") as [string, string];
  const refused = {
    expired: (
      await links.make({ userId: "firebase-uid-1", name: null, now: new Date(Date.now() - 61_000) })
    ).link,
    "with its signature changed": `${body}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`,
    "made with another Event Service's key": await loginLinks("f".repeat(64))
      .make({ userId: "firebase-uid-1", name: null })
      .then(({ link }) => link),
    "not a link": "not-a-link",
  };
  for (const [what, link] of Object.entries(refused)) {
    const res = await useLink(link);
    assert.equal(res.status, 401, what);
    assert.deepEqual(await res.json(), { error: "invalid_login_link" }, what);
    assert.equal(res.headers.get("Set-Cookie"), null, what);
  }
  // None of them used up anything: the good link still works.
  assert.equal((await useLink(good)).status, 204);
});

test("a login link replaces the session already there, and one that fails leaves it", async () => {
  const before = await logIn(await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  const cookie = sessionCookie(before);

  // A link that fails sets no cookie, so the browser keeps the one it has.
  const failed = await useLink("not-a-link", { cookie });
  assert.equal(failed.status, 401);
  assert.equal(failed.headers.get("Set-Cookie"), null);
  assert.equal((await me(before)).id, "firebase-uid-1");

  // The token tapped last is the one being looked at.
  const other = await useLink(await linkFor("firebase-guest-2"), { cookie });
  assert.equal(other.status, 204);
  assert.equal((await me(other)).id, "firebase-guest-2");
});

test("a body that isn't JSON with a login_link fails validation, so a form elsewhere can't log anyone in", async () => {
  const link = await linkFor("firebase-uid-1", "Ada Lim");
  const bodies: [string, string][] = [
    ["application/x-www-form-urlencoded", new URLSearchParams({ login_link: link }).toString()],
    ["text/plain", JSON.stringify({ login_link: link })],
    ["application/json", JSON.stringify({})],
    ["application/json", JSON.stringify({ login_link: "" })],
    ["application/json", JSON.stringify({ login_link: 42 })],
  ];
  for (const [contentType, body] of bodies) {
    const res = await productionApp.request("/auth/login-link", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    const what = `${contentType} ${body.slice(0, 40)}`;
    assert.equal(res.status, 400, what);
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed", what);
    assert.equal(res.headers.get("Set-Cookie"), null, what);
  }
  // Nothing above used the link up.
  assert.equal((await useLink(link)).status, 204);
});

test("using a login link, or failing to, logs nothing, so the link is in no log", async () => {
  const link = await linkFor("firebase-uid-1", "Ada Lim");
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  onTestFinished(() => spies.forEach((spy) => spy.mockRestore()));
  assert.equal((await useLink(link)).status, 204);
  assert.equal((await useLink(link)).status, 401);
  assert.equal((await useLink(`${link}x`)).status, 401);
  assert.deepEqual(
    spies.flatMap((spy) => spy.mock.calls),
    [],
  );
});
