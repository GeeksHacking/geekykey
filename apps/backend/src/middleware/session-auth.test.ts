import assert from "node:assert/strict";
import { Hono } from "hono";
import { test } from "vitest";
import { users } from "../db/schema.ts";
import { setupFixture } from "../test-helpers.ts";
import {
  clearSession,
  issueSession,
  requireRole,
  requireSession,
  SESSION_COOKIE,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";

const ORGANIZER_ID = "organizer-1";

/** A throwaway app with the two gates mounted the way real routes will mount them. */
async function harness(overrides: Partial<SessionOptions> = {}) {
  const fx = await setupFixture();
  await fx.db.insert(users).values({
    id: ORGANIZER_ID,
    displayName: "Priya",
    role: "organizer",
  });

  const options: SessionOptions = {
    secret: "test-secret-at-least-16",
    secure: false,
    ...overrides,
  };

  const app = new Hono<SessionEnv>()
    // The request's database, as the Worker hands it to every route.
    .use(async (c, next) => {
      c.set("db", fx.db);
      await next();
    })
    .post("/login/:id", async (c) => {
      await issueSession(c, c.req.param("id"), options);
      return c.body(null, 204);
    })
    .post("/logout", (c) => {
      clearSession(c, options);
      return c.body(null, 204);
    })
    .get("/me", requireSession(options), (c) => c.json({ user: c.var.user }))
    .get(
      "/admin",
      requireSession(options),
      requireRole("organizer"),
      (c) => c.json({ ok: true }),
    );

  const signIn = async (userId: string) => {
    const res = await app.request(`/login/${userId}`, { method: "POST" });
    assert.equal(res.status, 204);
    // Only the name=value pair travels back, the way a browser sends it.
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
  };

  const get = (path: string, cookie?: string) =>
    app.request(path, { headers: cookie ? { Cookie: cookie } : {} });

  return { ...fx, app, options, signIn, get };
}

test("answers 401 when there is no cookie", async () => {
  const { get } = await harness();
  const res = await get("/me");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("puts the signed-in user on the context", async () => {
  const { signIn, get, userId } = await harness();
  const res = await get("/me", await signIn(userId));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    user: { id: userId, displayName: "Alex", role: "participant" },
  });
});

test("issues an HttpOnly, SameSite=Lax cookie scoped to the whole site", async () => {
  const { app, userId } = await harness();
  const res = await app.request(`/login/${userId}`, { method: "POST" });
  const header = res.headers.get("Set-Cookie") ?? "";
  assert.match(header, new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  // Local development is plain http, where a Secure cookie would never come back.
  assert.doesNotMatch(header, /Secure/);
});

test("answers 401 for a cookie that has been edited", async () => {
  const { signIn, get, userId } = await harness();
  const res = await get("/me", `${await signIn(userId)}x`);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("answers 401 once the session has expired", async () => {
  const { signIn, get, userId } = await harness({ maxAgeSeconds: 0 });
  const res = await get("/me", await signIn(userId));
  assert.equal(res.status, 401);
});

test("answers 401 when the session names a user who is gone", async () => {
  const { signIn, get } = await harness();
  const res = await get("/me", await signIn("deleted-user"));
  assert.equal(res.status, 401);
});

test("gives a participant 403 on an organiser route", async () => {
  const { signIn, get, userId } = await harness();
  const res = await get("/admin", await signIn(userId));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});

test("lets an organizer through", async () => {
  const { signIn, get } = await harness();
  const res = await get("/admin", await signIn(ORGANIZER_ID));
  assert.equal(res.status, 200);
});

test("clearing the session removes the cookie from the browser", async () => {
  const { app } = await harness();
  const res = await app.request("/logout", { method: "POST" });
  const header = res.headers.get("Set-Cookie") ?? "";
  assert.match(header, new RegExp(`^${SESSION_COOKIE}=;`));
  assert.match(header, /Max-Age=0/);
});
