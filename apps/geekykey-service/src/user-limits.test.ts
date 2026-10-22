import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { onTestFinished, test, vi } from "vitest";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// The user limits (the API agreement's section 2, "Rate limits"): 60
// requests a minute to the API for each user, and 20 token lookups and
// claims, which count toward the 60 as well.

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

/** A user's requests a minute, as USER_LIMIT in wrangler.jsonc counts them. */
const USER_LIMIT = 60;
/** A user's lookups and claims a minute, as TOKEN_LIMIT in wrangler.jsonc counts them. */
const TOKEN_LIMIT = 20;

/** A token nobody owns, so a claim of it would succeed. */
const UID = "04A1B2C3D4E5F6";

/**
 * The Worker with wrangler.jsonc's settings and its services faked, and a
 * way to log in and call each user route as the screens would. Users are
 * counted by `userLimit` and `tokenLimit`, exact counts of USER_LIMIT and
 * TOKEN_LIMIT unless a test passes others.
 */
function harness({
  userLimit = fakeLimiter(USER_LIMIT),
  tokenLimit = fakeLimiter(TOKEN_LIMIT),
}: { userLimit?: RateLimit; tokenLimit?: RateLimit } = {}) {
  const config = loadConfig(env);
  const fake = fakeServices(config);
  const app = createApp(config, {
    send: fake.send,
    googleKeys: google.keys,
    stationLimit: fakeLimiter(60),
    userLimit,
    tokenLimit,
  });

  /** The gk_session cookie a Firebase login as `userId` sets, as the browser sends it back. */
  async function logIn(userId: string): Promise<string> {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: await google.signIdToken({ sub: userId }) }),
    });
    assert.equal(res.status, 204);
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  }

  const headers = (cookie: string | null): Record<string, string> =>
    cookie === null ? {} : { Cookie: cookie };

  /** Each user route, as the screens call it, with `cookie` or none. */
  const routes = {
    me: (cookie: string | null) => app.request("/api/v1/me", { headers: headers(cookie) }),
    lookUp: (cookie: string | null) =>
      app.request(`/api/v1/tokens/${UID}`, { headers: headers(cookie) }),
    claim: (cookie: string | null) =>
      app.request(`/api/v1/tokens/${UID}/claim`, { method: "POST", headers: headers(cookie) }),
    release: (cookie: string | null) =>
      app.request(`/api/v1/tokens/${UID}`, { method: "DELETE", headers: headers(cookie) }),
    loginLink: (cookie: string | null) =>
      app.request("/api/v1/login-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers(cookie) },
        body: JSON.stringify({ event_id: "showcase" }),
      }),
  };

  return { app, fake, logIn, routes };
}

type Route = (cookie: string | null) => Response | Promise<Response>;

/** `count` requests, one after another, each to the next of `routes` in turn, and their statuses. */
async function callMany(routes: Route[], count: number, cookie: string | null) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) statuses.push((await routes[i % routes.length]!(cookie)).status);
  return statuses;
}

/** Every log line the Worker writes during the test, parsed, with nothing printed. */
function loggedLines() {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => {
    logged.mockRestore();
    errors.mockRestore();
  });
  return () =>
    [...logged.mock.calls, ...errors.mock.calls].map(
      ([line]) => JSON.parse(line as string) as Record<string, unknown>,
    );
}

/** The answer to a user over a limit: 429 rate_limited, to try again in a minute. */
async function assertRateLimited(res: Response) {
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "rate_limited" });
}

test("a user's 61st request in a minute, spread over every route, is turned away", async () => {
  const { logIn, routes } = harness({ tokenLimit: fakeLimiter(USER_LIMIT) });
  loggedLines();
  const cookie = await logIn("firebase-uid-1");
  const { me, lookUp, claim, release, loginLink } = routes;

  const statuses = await callMany([me, lookUp, claim, release, loginLink], USER_LIMIT, cookie);
  assert.ok(!statuses.includes(429), String(statuses));

  for (const route of Object.values(routes)) await assertRateLimited(await route(cookie));
});

test("a user's 21st lookup or claim in a minute is turned away, while /me still answers", async () => {
  const { logIn, routes } = harness();
  loggedLines();
  const cookie = await logIn("firebase-uid-1");
  const { me, lookUp, claim, release, loginLink } = routes;

  const statuses = await callMany([lookUp, claim], TOKEN_LIMIT, cookie);
  assert.ok(!statuses.includes(429), String(statuses));

  await assertRateLimited(await lookUp(cookie));
  await assertRateLimited(await claim(cookie));
  assert.equal((await me(cookie)).status, 200);
  assert.equal((await release(cookie)).status, 204);
  assert.equal((await loginLink(cookie)).status, 201);
});

test("lookups and claims count toward the 60 as well", async () => {
  const { logIn, routes } = harness({ tokenLimit: fakeLimiter(USER_LIMIT) });
  loggedLines();
  const cookie = await logIn("firebase-uid-1");

  assert.ok(!(await callMany([routes.lookUp], USER_LIMIT, cookie)).includes(429));
  await assertRateLimited(await routes.me(cookie));
});

test("two users are counted apart", async () => {
  const { logIn, routes } = harness();
  loggedLines();
  const first = await logIn("firebase-uid-1");
  const second = await logIn("firebase-uid-2");

  await callMany([routes.me], USER_LIMIT, first);
  await assertRateLimited(await routes.me(first));
  assert.equal((await routes.me(second)).status, 200);

  await callMany([routes.lookUp], TOKEN_LIMIT, first);
  assert.equal((await routes.lookUp(second)).status, 200);
});

test("a request with no session isn't counted, and stays 401 unauthenticated", async () => {
  const userLimit = fakeLimiter(USER_LIMIT);
  const tokenLimit = fakeLimiter(TOKEN_LIMIT);
  const { routes } = harness({ userLimit, tokenLimit });

  const statuses = await callMany(Object.values(routes), USER_LIMIT + 1, null);
  assert.deepEqual(statuses, Array(USER_LIMIT + 1).fill(401));
  assert.deepEqual(userLimit.keys, []);
  assert.deepEqual(tokenLimit.keys, []);
});

test("a request whose path fails its check still counts", async () => {
  const userLimit = fakeLimiter(USER_LIMIT);
  const tokenLimit = fakeLimiter(TOKEN_LIMIT);
  const { app, logIn } = harness({ userLimit, tokenLimit });
  const cookie = await logIn("firebase-uid-1");

  // Not 4 to 10 hex bytes.
  const res = await app.request("/api/v1/tokens/not-a-uid", { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
  assert.deepEqual(userLimit.keys, ["firebase-uid-1"]);
  assert.deepEqual(tokenLimit.keys, ["firebase-uid-1"]);
});

test("a user turned away is logged once, by their user ID", async () => {
  const { logIn, routes } = harness();
  const lines = loggedLines();
  const cookie = await logIn("firebase-uid-1");
  await callMany([routes.me], USER_LIMIT + 1, cookie);
  await callMany([routes.lookUp], TOKEN_LIMIT + 1, await logIn("firebase-uid-2"));

  assert.deepEqual(
    lines().filter((line) => line.message === "rate_limited"),
    [
      { severity: "INFO", message: "rate_limited", user_id: "firebase-uid-1" },
      { severity: "INFO", message: "rate_limited", user_id: "firebase-uid-2" },
    ],
  );
});

test("wrangler.jsonc's limits let a user's first 20 lookups through, and turn one of the next 21 away, and the same for 60 requests", async () => {
  // Wrangler's simulation of the bindings counts in windows that follow the
  // wall clock, so the requests can straddle two. Whichever minute they
  // start in, no window holds more than the first ones, and one holds at
  // least the limit and one more of the rest. A user of their own each
  // time, as the simulation's counts outlast a test.
  const { logIn, routes } = harness({ userLimit: env.USER_LIMIT, tokenLimit: env.TOKEN_LIMIT });
  loggedLines();

  const looker = await logIn(`firebase-${crypto.randomUUID()}`);
  assert.deepEqual(
    await callMany([routes.lookUp], TOKEN_LIMIT, looker),
    Array(TOKEN_LIMIT).fill(200),
  );
  assert.ok((await callMany([routes.lookUp], TOKEN_LIMIT + 1, looker)).includes(429));

  const user = await logIn(`firebase-${crypto.randomUUID()}`);
  assert.deepEqual(await callMany([routes.me], USER_LIMIT, user), Array(USER_LIMIT).fill(200));
  assert.ok((await callMany([routes.me], USER_LIMIT + 1, user)).includes(429));
});
