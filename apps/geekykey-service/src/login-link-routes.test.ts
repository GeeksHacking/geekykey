import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { loginLinks } from "@geekykey/login-link";
import { onTestFinished, test, vi } from "vitest";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// POST /api/v1/login-links on the GeekyKey Service (the API agreement's 8.6):
// a login link to one event's screens, for the user behind gk_session. Each
// link is read back here as the Event Service reads it, with the package
// they share and that Event Service's key.

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

/** The showcase's links, as its Event Service reads them, with the key vitest.config.ts sets. */
const showcaseLinks = loginLinks(env.EVENT_SERVICE_KEY_SHOWCASE);

/**
 * The Worker as production starts it, with wrangler.jsonc's settings and
 * `changes` on top, and ways to log in and ask for a link as a browser would.
 */
function harness(changes: Record<string, unknown> = {}) {
  const config = loadConfig({ ...env, ...changes });
  const fake = fakeServices(config);
  const app = createApp(config, {
    send: fake.send,
    googleKeys: google.keys,
    stationLimit: env.STATION_LIMIT,
    userLimit: fakeLimiter(60),
    tokenLimit: fakeLimiter(20),
  });

  /** The gk_session cookie a Firebase login with `idToken` sets, as the browser sends it back. */
  async function logIn(idToken: string | Promise<string>): Promise<string> {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: await idToken }),
    });
    assert.equal(res.status, 204);
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  }

  /** POST /api/v1/login-links with `body`, as the event buttons send it. */
  const askForLink = (cookie: string | undefined, body: unknown = { event_id: "showcase" }) =>
    app.request("/api/v1/login-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  return { app, fake, logIn, askForLink };
}

/** The link in a 201's `url`, from its `#login=` fragment. */
async function linkIn(res: Response): Promise<string> {
  const { url } = (await res.json()) as { url: string };
  const fragment = new URL(url).hash;
  assert.match(fragment, /^#login=/);
  return fragment.slice("#login=".length);
}

test("a Google user gets a link to the showcase's screens, with their user ID and name, for 60 seconds", async () => {
  const { logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  const before = Date.now();
  const res = await askForLink(cookie);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("Cache-Control"), "no-store");

  const { url, expires_at } = (await res.clone().json()) as { url: string; expires_at: string };
  // The event's address from EVENT_SERVICES, with the link in the fragment, never the query.
  assert.ok(url.startsWith("https://event.geekshacking.com/#login="), url);
  assert.equal(new URL(url).search, "");
  assert.match(expires_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const expiresAt = Date.parse(expires_at);
  // Whole seconds, as `exp` is, so up to a second short of 60 after `before`.
  assert.ok(expiresAt > before + 59_000 && expiresAt <= Date.now() + 60_000, expires_at);

  const link = await showcaseLinks.read(await linkIn(res));
  assert.ok(link, "the showcase's Event Service can't read the link");
  assert.equal(link.userId, "firebase-uid-1");
  assert.equal(link.name, "Ada Lim");
  assert.equal(link.expiresAt.getTime(), expiresAt);
});

test("a guest gets a link too, with no name", async () => {
  const { logIn, askForLink } = harness();
  const res = await askForLink(await logIn(google.signGuestIdToken("firebase-guest-1")));
  assert.equal(res.status, 201);
  const link = await showcaseLinks.read(await linkIn(res));
  assert.equal(link?.userId, "firebase-guest-1");
  assert.equal(link?.name, null);
});

test("the link carries only the session's user ID and name, whatever the request says", async () => {
  const { logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  const res = await askForLink(cookie, {
    event_id: "showcase",
    sub: "someone-else",
    user_id: "someone-else",
    name: "Somebody Else",
  });
  assert.equal(res.status, 201);
  const link = await showcaseLinks.read(await linkIn(res));
  assert.equal(link?.userId, "firebase-uid-1");
  assert.equal(link?.name, "Ada Lim");
});

// The token's kind (ADR 0006).

/** Normalised, and in the list as kind E. */
const UID = "04A1B2C3D4E5F6";

test("a link from a token's page carries the token's kind, when the user owns it", async () => {
  const { fake, logIn, askForLink } = harness();
  fake.owners.set(UID, "firebase-uid-1");
  fake.kinds.set(UID, "E");
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  // In any separator style, as the token page's address may have it.
  for (const uid of [UID, "04:a1:b2:c3:d4:e5:f6"]) {
    const res = await askForLink(cookie, { event_id: "showcase", uid });
    assert.equal(res.status, 201, uid);
    assert.equal((await showcaseLinks.read(await linkIn(res)))?.kind, "E", uid);
  }
});

test("a link carries no kind for a token with none, someone else's, or nobody's, or with no uid", async () => {
  const { fake, logIn, askForLink } = harness();
  fake.owners.set(UID, "firebase-uid-1");
  fake.owners.set("04C9E1A27B3080", "someone-else");
  fake.kinds.set("04C9E1A27B3080", "V");
  fake.kinds.set("04D00D00D00D00", "V");
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  for (const body of [
    { event_id: "showcase", uid: UID },
    { event_id: "showcase", uid: "04C9E1A27B3080" },
    { event_id: "showcase", uid: "04D00D00D00D00" },
    { event_id: "showcase" },
  ]) {
    const res = await askForLink(cookie, body);
    assert.equal(res.status, 201, JSON.stringify(body));
    const link = await showcaseLinks.read(await linkIn(res));
    assert.equal(link?.userId, "firebase-uid-1", JSON.stringify(body));
    assert.equal(link?.kind, null, JSON.stringify(body));
  }
});

test("a link with no uid doesn't ask the claims stand-in", async () => {
  const { fake, logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  assert.equal((await askForLink(cookie)).status, 201);
  assert.deepEqual(fake.sent, []);
});

test("with a uid, a claims stand-in that doesn't answer properly gets 503 claims_unavailable", async () => {
  const { fake, logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => logged.mockRestore());
  fake.answers.owners = async () => new Response(null, { status: 500 });
  const res = await askForLink(cookie, { event_id: "showcase", uid: UID });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
});

test("a uid that isn't one fails validation", async () => {
  const { logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  for (const uid of ["zz", "", 7, null]) {
    const res = await askForLink(cookie, { event_id: "showcase", uid });
    assert.equal(res.status, 400, JSON.stringify(uid));
  }
});

test("each link is new, so each works once on its own", async () => {
  const { logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  const first = await showcaseLinks.read(await linkIn(await askForLink(cookie)));
  const second = await showcaseLinks.read(await linkIn(await askForLink(cookie)));
  assert.ok(first && second);
  assert.notEqual(first.jti, second.jti);
});

test("a link for one Event Service is signed with its key, so another's can't read it", async () => {
  const { logIn, askForLink } = harness({
    EVENT_SERVICES: [
      ...(env.EVENT_SERVICES as unknown[]),
      {
        id: "other",
        name: "Other Event",
        url: "https://other-api.example",
        public_url: "https://other.example",
      },
    ],
    EVENT_SERVICE_KEY_OTHER: "a".repeat(64),
  });
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  const res = await askForLink(cookie, { event_id: "other" });
  assert.equal(res.status, 201);
  const raw = await res.clone().json();
  assert.ok((raw as { url: string }).url.startsWith("https://other.example/#login="));

  const link = await linkIn(res);
  assert.equal((await loginLinks("a".repeat(64)).read(link))?.userId, "firebase-uid-1");
  assert.equal(await showcaseLinks.read(link), null);
});

test("an event_id that isn't in /me's events gets not_found", async () => {
  const { logIn, askForLink } = harness({
    // An Event Service with no public address isn't in `events`, so there's nowhere to open.
    EVENT_SERVICES: [
      { id: "showcase", name: "Capstone Showcase", url: "https://event-api.geekshacking.com" },
    ],
  });
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  for (const event_id of ["showcase", "nonexistent"]) {
    const res = await askForLink(cookie, { event_id });
    assert.equal(res.status, 404, event_id);
    assert.deepEqual(await res.json(), { error: "not_found" }, event_id);
  }
});

test("no session gets unauthenticated, and no link", async () => {
  const { askForLink } = harness();
  const res = await askForLink(undefined);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("a body without an event_id fails validation", async () => {
  const { app, logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1" }));
  for (const body of [{}, { event_id: "" }, { event_id: 7 }]) {
    const res = await askForLink(cookie, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
  const form = await app.request("/api/v1/login-links", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: "event_id=showcase",
  });
  assert.equal(form.status, 400);
});

test("making a link logs nothing, so the link is in no log", async () => {
  const { logIn, askForLink } = harness();
  const cookie = await logIn(google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" }));
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  onTestFinished(() => spies.forEach((spy) => spy.mockRestore()));
  assert.equal((await askForLink(cookie)).status, 201);
  assert.deepEqual(
    spies.flatMap((spy) => spy.mock.calls),
    [],
  );
});
