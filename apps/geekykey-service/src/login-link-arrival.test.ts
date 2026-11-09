import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { loginLinks } from "@geekykey/login-link";
import { onTestFinished, test, vi } from "vitest";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// POST /auth/login-link on the GeekyKey Service (the API agreement's 7.5,
// BAC-157): a login link from an Event Service's screens logs its user in
// here as the same user. The GeekyKey Service keeps no database, so the
// Event Service that made the link marks it used (11.11).

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

/** How the showcase's Event Service makes links to these screens, with the key vitest.config.ts sets. */
const fromShowcase = loginLinks(env.EVENT_SERVICE_KEY_SHOWCASE, { to: "geekykey" });

/** The Worker as production starts it, with wrangler.jsonc's settings and `changes` on top. */
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

  /** POST /auth/login-link, as the GeekyKey screens send the link from their address's fragment. */
  const useLink = (link: string, cookie?: string) =>
    app.request("/auth/login-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ login_link: link }),
    });

  /** Who GET /api/v1/me says is signed in with `cookie`, or null for nobody. */
  const whoIs = async (cookie: string) => {
    const res = await app.request("/api/v1/me", { headers: { Cookie: cookie } });
    if (res.status === 401) return null;
    return ((await res.json()) as { user: { id: string } }).user.id;
  };

  return { app, fake, useLink, whoIs };
}

/** The cookie a 204 sets, as the browser sends it back. */
function cookieFrom(res: Response): string {
  return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
}

/** The requests the Worker sent to mark a link used. */
function markings(fake: ReturnType<typeof fakeServices>) {
  return fake.sent.filter(({ url }) => url.endsWith("/geekykey/v1/used-login-links"));
}

test("a link from the showcase's screens logs its user in here, with the name it carries", async () => {
  const { app, fake, useLink, whoIs } = harness();
  const { link, expiresAt } = await fromShowcase.make({ userId: "firebase-guest-1", name: "Ada" });
  const res = await useLink(link);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const cookie = cookieFrom(res);
  assert.match(cookie, /^gk_session=/);
  assert.match(res.headers.get("Set-Cookie") ?? "", /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(await whoIs(cookie), "firebase-guest-1");

  // The Event Service that made it was asked to mark it used, with its own key.
  const [marking] = markings(fake);
  const { jti } = (await fromShowcase.read(link))!;
  assert.deepEqual(marking, {
    method: "POST",
    url: "https://event-api.geekshacking.com/geekykey/v1/used-login-links",
    authorization: `Bearer ${env.EVENT_SERVICE_KEY_SHOWCASE}`,
    redirect: "manual",
    body: { jti, expires_at: expiresAt.toISOString() },
  });

  // The session holds the name, so a link back to the event carries it (8.6).
  const back = await app.request("/api/v1/login-links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ event_id: "showcase" }),
  });
  const { url } = (await back.json()) as { url: string };
  const toEvent = await loginLinks(env.EVENT_SERVICE_KEY_SHOWCASE).read(
    new URL(url).hash.slice("#login=".length),
  );
  assert.equal(toEvent?.userId, "firebase-guest-1");
  assert.equal(toEvent?.name, "Ada");
});

test("a link works once", async () => {
  const { useLink } = harness();
  const { link } = await fromShowcase.make({ userId: "firebase-guest-1", name: null });
  assert.equal((await useLink(link)).status, 204);

  const again = await useLink(link);
  assert.equal(again.status, 401);
  assert.deepEqual(await again.json(), { error: "invalid_login_link" });
  assert.equal(again.headers.get("Set-Cookie"), null);
});

test("a link that doesn't check out gets invalid_login_link, and asks no Event Service", async () => {
  const { fake, useLink } = harness();
  const { link: good } = await fromShowcase.make({ userId: "firebase-guest-1", name: null });
  const [body, signature] = good.split(".") as [string, string];
  const refused = {
    expired: (
      await fromShowcase.make({
        userId: "firebase-guest-1",
        name: null,
        now: new Date(Date.now() - 61_000),
      })
    ).link,
    "with its signature changed": `${body}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`,
    // A link to the event's screens is signed with the other key, so it can't be turned around.
    "made for the event's screens": (
      await loginLinks(env.EVENT_SERVICE_KEY_SHOWCASE).make({
        userId: "firebase-guest-1",
        name: null,
      })
    ).link,
    "made with another Event Service's key": (
      await loginLinks("f".repeat(64), { to: "geekykey" }).make({ userId: "x", name: null })
    ).link,
    "not a link": "not-a-link",
  };
  for (const [what, link] of Object.entries(refused)) {
    const res = await useLink(link);
    assert.equal(res.status, 401, what);
    assert.deepEqual(await res.json(), { error: "invalid_login_link" }, what);
    assert.equal(res.headers.get("Set-Cookie"), null, what);
  }
  assert.deepEqual(markings(fake), []);
  // None of them used up anything: the good link still works.
  assert.equal((await useLink(good)).status, 204);
});

test("an Event Service whose entry doesn't say login_links_to_geekykey logs nobody in", async () => {
  const { fake, useLink } = harness({
    EVENT_SERVICES: JSON.stringify([
      {
        id: "showcase",
        name: "Capstone Showcase",
        url: "https://event-api.geekshacking.com",
        public_url: "https://event.geekshacking.com",
      },
    ]),
  });
  const { link } = await fromShowcase.make({ userId: "firebase-guest-1", name: null });
  const res = await useLink(link);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_login_link" });
  assert.deepEqual(markings(fake), []);
});

test("when the Event Service can't mark the link used, nobody is logged in, and the reason is logged without the link", async () => {
  const { fake, useLink } = harness();
  const lines: unknown[] = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args) => void lines.push(...args)),
  );
  onTestFinished(() => spies.forEach((spy) => spy.mockRestore()));

  for (const answer of [
    async () => Response.json({ error: "internal_error" }, { status: 500 }),
    // An Event Service from before BAC-157.
    async () => Response.json({ error: "not_found" }, { status: 404 }),
    async () => Response.json({ first_use: "yes" }),
  ]) {
    fake.answers.usedLoginLinks = answer;
    const { link } = await fromShowcase.make({ userId: "firebase-guest-1", name: null });
    const res = await useLink(link);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "event_service_unavailable" });
    assert.equal(res.headers.get("Set-Cookie"), null);
    assert.ok(!JSON.stringify(lines).includes(link.split(".")[1]!), "the link was logged");
  }
  const logged = lines.map((line) => JSON.parse(String(line)) as Record<string, unknown>);
  assert.deepEqual(
    logged.map(({ message, event_service, user_id, reason, status }) => ({
      message,
      event_service,
      user_id,
      reason,
      status,
    })),
    [
      {
        message: "login_link_unavailable",
        event_service: "showcase",
        user_id: "firebase-guest-1",
        reason: "status",
        status: 500,
      },
      {
        message: "login_link_unavailable",
        event_service: "showcase",
        user_id: "firebase-guest-1",
        reason: "status",
        status: 404,
      },
      {
        message: "login_link_unavailable",
        event_service: "showcase",
        user_id: "firebase-guest-1",
        reason: "unparseable",
        status: undefined,
      },
    ],
  );
});

test("a link replaces the session already there, and one that fails leaves it", async () => {
  const { useLink, whoIs } = harness();
  const first = await useLink(
    (await fromShowcase.make({ userId: "firebase-guest-1", name: null })).link,
  );
  const cookie = cookieFrom(first);

  const failed = await useLink("not-a-link", cookie);
  assert.equal(failed.headers.get("Set-Cookie"), null);
  assert.equal(await whoIs(cookie), "firebase-guest-1");

  const other = await useLink(
    (await fromShowcase.make({ userId: "firebase-guest-2", name: null })).link,
    cookie,
  );
  assert.equal(other.status, 204);
  assert.equal(await whoIs(cookieFrom(other)), "firebase-guest-2");
});

test("a body that isn't JSON with a login_link fails validation, so a form elsewhere can't log anyone in", async () => {
  const { app, fake } = harness();
  const { link } = await fromShowcase.make({ userId: "firebase-guest-1", name: null });
  for (const [contentType, body] of [
    ["application/x-www-form-urlencoded", new URLSearchParams({ login_link: link }).toString()],
    ["text/plain", JSON.stringify({ login_link: link })],
    ["application/json", JSON.stringify({ login_link: "" })],
  ] as const) {
    const res = await app.request("/auth/login-link", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    assert.equal(res.status, 400, contentType);
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
    assert.equal(res.headers.get("Set-Cookie"), null);
  }
  assert.deepEqual(markings(fake), []);
});

test("using a link, or failing to, logs nothing when the Event Service answers", async () => {
  const { useLink } = harness();
  const { link } = await fromShowcase.make({ userId: "firebase-guest-1", name: null });
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
