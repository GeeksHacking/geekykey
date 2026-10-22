import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import { onTestFinished, test, vi } from "vitest";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// GET /api/v1/me on the GeekyKey Service (the API agreement's 8.4): who's
// logged in, their tokens and the events to link to. The GeekyKey screens'
// "Am I logged in?".

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

/**
 * The Worker as production starts it, with wrangler.jsonc's settings and
 * `changes` on top, its services faked, and a way to log in as a user and
 * then ask for /me with the cookie, as a browser would.
 */
function harness(changes: Record<string, unknown> = {}, { claimsDeadlineMs = 4000 } = {}) {
  const config = loadConfig({ ...env, GEEKYKEY_ADMINS: ["admin-1"], ...changes });
  const fake = fakeServices(config);
  const app = createApp(config, {
    send: fake.send,
    googleKeys: google.keys,
    claimsDeadlineMs,
    stationLimit: env.STATION_LIMIT,
  });

  /**
   * The gk_session cookie a Firebase login as `userId` sets, as the browser
   * sends it back. A guest logs in with a guest's ID token.
   */
  async function logIn(userId: string, { guest = false } = {}): Promise<string> {
    const idToken = guest
      ? await google.signGuestIdToken(userId)
      : await google.signIdToken({ sub: userId });
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    assert.equal(res.status, 204);
    // Only the name=value pair travels back.
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  }

  const me = (cookie?: string) =>
    app.request("/api/v1/me", { headers: cookie === undefined ? {} : { Cookie: cookie } });

  return { fake, logIn, me };
}

test("a user gets their ID, their tokens oldest claim first, and the showcase to link to", async () => {
  const { fake, logIn, me } = harness();
  fake.tokens.set("firebase-uid-1", [
    { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:00:00.000Z" },
    { uid: "DEADBEEF", claimed_at: "2026-11-18T05:30:00.000Z" },
  ]);
  const res = await me(await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), {
    user: { id: "firebase-uid-1", is_geekykey_admin: false },
    tokens: [
      { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:00:00.000Z" },
      { uid: "DEADBEEF", claimed_at: "2026-11-18T05:30:00.000Z" },
    ],
    events: [{ id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" }],
  });

  // It asked the stand-in for this user's tokens, with the stand-in's key.
  const asked = fake.sent.filter(({ url }) => url.includes("/users/"));
  assert.deepEqual(
    asked.map(({ method, url, authorization }) => [method, url, authorization]),
    [
      [
        "GET",
        `${env.CLAIMS_STAND_IN_URL}/users/firebase-uid-1/tokens`,
        `Bearer ${env.CLAIMS_STAND_IN_KEY}`,
      ],
    ],
  );
});

test("a user on GEEKYKEY_ADMINS is a GeekyKey admin", async () => {
  const { logIn, me } = harness();
  const res = await me(await logIn("admin-1"));
  assert.equal(res.status, 200);
  const { user } = (await res.json()) as { user: unknown };
  assert.deepEqual(user, { id: "admin-1", is_geekykey_admin: true });
});

test("a guest gets their ID and the tokens claimed for it, like any other user", async () => {
  const { fake, logIn, me } = harness();
  fake.tokens.set("firebase-guest-1", [
    { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:00:00.000Z" },
  ]);
  const res = await me(await logIn("firebase-guest-1", { guest: true }));
  assert.equal(res.status, 200);
  const { user, tokens } = (await res.json()) as { user: unknown; tokens: unknown };
  assert.deepEqual(user, { id: "firebase-guest-1", is_geekykey_admin: false });
  assert.deepEqual(tokens, [{ uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:00:00.000Z" }]);
});

/** A gk_session cookie holding `value`, signed with `secret`, as the browser would send it back. */
async function signedCookie(value: string, secret: string): Promise<string> {
  const signer = new Hono().get("/", async (c) => {
    await setSignedCookie(c, "gk_session", value, secret);
    return c.body(null, 204);
  });
  const res = await signer.request("/");
  return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
}

test("without a usable session, /me answers unauthenticated and asks the stand-in nothing", async () => {
  const { fake, logIn, me } = harness();
  const good = await logIn("firebase-uid-1");
  const value = decodeURIComponent(good.slice(good.indexOf("=") + 1));
  const session = (exp: number) => JSON.stringify({ exp, sub: "firebase-uid-1", name: null });
  const later = Date.now() + 60_000;
  const unusable = {
    "no cookie": undefined,
    "a cookie with no signature": `gk_session=${encodeURIComponent(session(later))}`,
    "a cookie signed with another secret": await signedCookie(
      session(later),
      "someone-elses-session-secret",
    ),
    "a cookie whose user was changed": `gk_session=${encodeURIComponent(value.replace("uid-1", "uid-2"))}`,
    "an expired session": await signedCookie(session(Date.now() - 1000), env.SESSION_SECRET),
    // gk_session before it held the name. The screens log the user in again (7.2).
    "a session from before the name, expiry:userId": await signedCookie(
      `${later}:firebase-uid-1`,
      env.SESSION_SECRET,
    ),
    // The Event Service's cookie, which shares localhost with this one.
    event_session: `event_session=${good.slice(good.indexOf("=") + 1)}`,
  };
  for (const [what, cookie] of Object.entries(unusable)) {
    const res = await me(cookie);
    assert.equal(res.status, 401, what);
    assert.deepEqual(await res.json(), { error: "unauthenticated" }, what);
  }
  assert.deepEqual(fake.sent, []);
  // The same session, rightly signed and unexpired, works, so each case above failed for its own reason.
  assert.equal((await me(await signedCookie(session(later), env.SESSION_SECRET))).status, 200);
});

test("an Event Service without a public address isn't in events", async () => {
  const { logIn, me } = harness({
    EVENT_SERVICES: [
      { id: "showcase", name: "Capstone Showcase", url: "https://event-api.geekshacking.com" },
      {
        id: "bingo_night",
        name: "Bingo Night",
        url: "https://bingo-api.example.com",
        public_url: "https://bingo.example.com",
      },
    ],
    EVENT_SERVICE_KEY_BINGO_NIGHT: "b".repeat(64),
  });
  const res = await me(await logIn("firebase-uid-1"));
  const { events } = (await res.json()) as { events: unknown };
  assert.deepEqual(events, [
    { id: "bingo_night", name: "Bingo Night", url: "https://bingo.example.com" },
  ]);
});

/** Every line logged as an error during this test, each read as one JSON object. */
function loggedErrors() {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => errors.mockRestore());
  return () =>
    errors.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown>);
}

test("a stand-in that doesn't answer within the deadline gets claims_unavailable, and is logged", async () => {
  const { fake, logIn, me } = harness({}, { claimsDeadlineMs: 200 });
  const cookie = await logIn("firebase-uid-1");
  const logged = loggedErrors();
  // Answers, but long after the deadline.
  fake.answers.tokens = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Response.json({ tokens: [] });
  };
  const startedAt = Date.now();
  const res = await me(cookie);
  const took = Date.now() - startedAt;
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
  assert.ok(took < 600, `took ${took} ms, not cut short at the deadline`);
  assert.deepEqual(
    logged().map(({ message, user_id, reason }) => [message, user_id, reason]),
    [["claims_unavailable", "firebase-uid-1", "timeout"]],
  );
});

test("a stand-in that answers wrongly gets claims_unavailable too", async () => {
  const { fake, logIn, me } = harness();
  const cookie = await logIn("firebase-uid-1");
  const logged = loggedErrors();
  const wrong: Record<string, () => Response> = {
    "a 500": () => Response.json({ error: "internal_error" }, { status: 500 }),
    "a redirect": () =>
      new Response(null, { status: 302, headers: { Location: "https://elsewhere.example" } }),
    "a body that isn't the stand-in's": () => Response.json({ tokens: [{ uid: "DEADBEEF" }] }),
  };
  for (const [what, answer] of Object.entries(wrong)) {
    fake.answers.tokens = async () => answer();
    const res = await me(cookie);
    assert.equal(res.status, 503, what);
    assert.deepEqual(await res.json(), { error: "claims_unavailable" }, what);
  }
  assert.deepEqual(
    logged().map(({ reason }) => reason),
    ["status", "status", "unparseable"],
  );
});
