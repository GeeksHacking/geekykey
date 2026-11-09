import assert from "node:assert/strict";
import { loginLinks } from "@geekykey/login-link";
import { onTestFinished, test, vi } from "vitest";
import {
  screensSchemas,
  setupFixture,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../test-helpers.ts";
import { users } from "./schema.ts";

// Login links the other way (BAC-157): the Event Service makes one for its
// session's user (the API agreement's 8.12), the GeekyKey Service checks it,
// and marks it used here (11.11), since it keeps no database.

const app = testApp();

/** How the GeekyKey Service reads the links this Event Service makes. */
const toGeekykey = loginLinks(TEST_EVENT_SERVICE_KEY, { to: "geekykey" });

/** event_session for `userId`, through dev-login. */
async function sessionFor(userId: string) {
  const res = await app.request("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  assert.equal(res.status, 204);
  const cookie = res.headers.get("Set-Cookie") ?? "";
  return cookie.slice(0, cookie.indexOf(";"));
}

/** POST /api/v1/login-links, as the Event screens' My tokens sends it. */
function makeLink(cookie?: string) {
  return app.request("/api/v1/login-links", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
  });
}

interface LinkAnswer {
  login_link: string;
  expires_at: string;
}

test("a user gets a link to the GeekyKey screens naming them, which works for 60 seconds", async () => {
  const { userId } = await setupFixture();
  const before = Date.now();
  const res = await makeLink(await sessionFor(userId));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = (await res.json()) as LinkAnswer;
  // What the Event screens' My tokens reads it with.
  screensSchemas.geekykeyLoginLinkResponseSchema.parse(body);
  assert.deepEqual(Object.keys(body).sort(), ["expires_at", "login_link"]);

  const link = await toGeekykey.read(body.login_link);
  assert.ok(link);
  // setupFixture's user has the name their login gave them.
  assert.equal(link.userId, userId);
  assert.equal(link.name, "Alex");
  assert.equal(link.kind, null);
  assert.equal(body.expires_at, link.expiresAt.toISOString());
  const lifetime = link.expiresAt.getTime() - before;
  assert.ok(lifetime > 58_000 && lifetime <= 61_000, `${lifetime}`);
});

test("the link is for the GeekyKey screens only, so this Event Service's own login refuses it", async () => {
  const { userId } = await setupFixture();
  const { login_link } = (await (await makeLink(await sessionFor(userId))).json()) as LinkAnswer;
  assert.equal(await loginLinks(TEST_EVENT_SERVICE_KEY).read(login_link), null);
  const res = await app.request("/auth/login-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_link }),
  });
  assert.equal(res.status, 401);
});

test("a link carries no name for a guest, or for a user who set their own", async () => {
  await setupFixture();
  await testDb()
    .insert(users)
    .values([
      { id: "guest-1", displayName: "Guest" },
      { id: "named-1", displayName: "Ally", nameSetAt: "2026-11-09T02:00:00.000Z" },
    ]);
  for (const userId of ["guest-1", "named-1"]) {
    const { login_link } = (await (await makeLink(await sessionFor(userId))).json()) as LinkAnswer;
    const link = await toGeekykey.read(login_link);
    assert.equal(link?.userId, userId);
    assert.equal(link?.name, null, userId);
  }
});

test("each link is a new one", async () => {
  const { userId } = await setupFixture();
  const cookie = await sessionFor(userId);
  const jtis = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const { login_link } = (await (await makeLink(cookie)).json()) as LinkAnswer;
    jtis.add((await toGeekykey.read(login_link))!.jti);
  }
  assert.equal(jtis.size, 3);
});

test("nobody signed in gets unauthenticated, and no link", async () => {
  const res = await makeLink();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("making a link logs nothing, so the link is in no log", async () => {
  const { userId } = await setupFixture();
  const cookie = await sessionFor(userId);
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  onTestFinished(() => spies.forEach((spy) => spy.mockRestore()));
  assert.equal((await makeLink(cookie)).status, 201);
  assert.deepEqual(
    spies.flatMap((spy) => spy.mock.calls),
    [],
  );
});

/** POST /geekykey/v1/used-login-links, as the GeekyKey Service sends it, with the Event Service key unless told otherwise. */
function markUsed(
  body: unknown,
  authorization: string | null = `Bearer ${TEST_EVENT_SERVICE_KEY}`,
) {
  return app.request("/geekykey/v1/used-login-links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === null ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify(body),
  });
}

/** A jti and expiry, as the GeekyKey Service reads them from a link. */
const USED = {
  jti: "9f2c4e00000000000000000000000000",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
};

test("a link marked used is a first use once, and never again", async () => {
  await setupFixture();
  const first = await markUsed(USED);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { first_use: true });

  const again = await markUsed(USED);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { first_use: false });

  const other = await markUsed({ ...USED, jti: "0123456789abcdef0123456789abcdef" });
  assert.deepEqual(await other.json(), { first_use: true });
});

test("a link marked used twice at once is a first use for only one of them", async () => {
  await setupFixture();
  const answers = await Promise.all([markUsed(USED), markUsed(USED), markUsed(USED)]);
  const firstUses = await Promise.all(
    answers.map(async (res) => ((await res.json()) as { first_use: boolean }).first_use),
  );
  assert.deepEqual(firstUses.sort(), [false, false, true]);
});

test("marking a link used without the Event Service key, or with another, is refused", async () => {
  await setupFixture();
  for (const authorization of [null, `Bearer ${"6".repeat(64)}`]) {
    const res = await markUsed(USED, authorization);
    assert.equal(res.status, 401, `${authorization}`);
    assert.deepEqual(await res.json(), { error: "invalid_event_service_key" });
  }
  // Nothing was marked.
  assert.deepEqual(await (await markUsed(USED)).json(), { first_use: true });
});

test("marking a link used with a body the schema rejects is a 400, and marks nothing", async () => {
  await setupFixture();
  const res = await markUsed({ ...USED, jti: "short" });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
});
