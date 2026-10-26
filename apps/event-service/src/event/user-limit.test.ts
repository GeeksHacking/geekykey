import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { fakeClock, testApp, testDb } from "../test-helpers.ts";
import { users } from "./schema.ts";

const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";
const OTHER_PARTICIPANT = "user-2";

/**
 * Every test goes through the HTTP app, with its clock pinned, since the
 * limit counts each user's requests over one minute of that clock (the API
 * agreement's section 2, "Rate limits").
 */
async function harness() {
  const clock = fakeClock("2026-11-18T09:00:00.000Z");
  const app = testApp({}, { now: clock.now });
  // Dev-login signs in only someone who has logged in to this event before.
  await testDb()
    .insert(users)
    .values([
      { id: ORGANIZER, displayName: "Olive" },
      { id: PARTICIPANT, displayName: "Alex" },
      { id: OTHER_PARTICIPANT, displayName: "Sam" },
    ]);

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };

  const request = (path: string, cookie?: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: cookie ? { Cookie: cookie } : {} });

  /** Sends `count` passport polls, each of which must answer 200. */
  const pollMe = async (cookie: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const res = await request("/api/v1/me", cookie);
      assert.equal(res.status, 200, `request ${i + 1}`);
    }
  };

  return { app, clock, signIn, request, pollMe };
}

async function assertRateLimited(res: Response) {
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
}

test("the 61st request in a minute from one user gets 429 rate_limited", async () => {
  const { signIn, request, pollMe } = await harness();
  const cookie = await signIn(PARTICIPANT);

  await pollMe(cookie, 60);

  await assertRateLimited(await request("/api/v1/me", cookie));
});

test("each request turned away writes one rate_limited line naming the user", async () => {
  const { signIn, request, pollMe } = await harness();
  const cookie = await signIn(PARTICIPANT);
  await pollMe(cookie, 60);
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => logged.mockRestore());

  await request("/api/v1/me", cookie);
  await request("/api/v1/me", cookie);

  const line = { severity: "INFO", message: "rate_limited", user_id: PARTICIPANT };
  assert.deepEqual(
    logged.mock.calls.map(([text]) => JSON.parse(text as string)),
    [line, line],
  );
});

test("another user still gets answers while one is over the limit", async () => {
  const { signIn, request, pollMe } = await harness();
  const cookie = await signIn(PARTICIPANT);
  await pollMe(cookie, 60);
  await assertRateLimited(await request("/api/v1/me", cookie));

  const other = await request("/api/v1/me", await signIn(OTHER_PARTICIPANT));
  assert.equal(other.status, 200);
});

test("the count starts again once the minute is over", async () => {
  const { clock, signIn, request, pollMe } = await harness();
  const cookie = await signIn(PARTICIPANT);
  await pollMe(cookie, 60);

  clock.advanceSeconds(59);
  await assertRateLimited(await request("/api/v1/me", cookie));

  clock.advanceSeconds(1);
  await pollMe(cookie, 60);
  await assertRateLimited(await request("/api/v1/me", cookie));
});

test("the passport's poll, one every 10 seconds, never reaches the limit", async () => {
  const { clock, signIn, pollMe } = await harness();
  const cookie = await signIn(PARTICIPANT);
  // Ten minutes of polls.
  for (let i = 0; i < 60; i++) {
    await pollMe(cookie, 1);
    clock.advanceSeconds(10);
  }
});

test("an organizer's calls count toward the same 60 as their /me", async () => {
  const { signIn, request, pollMe } = await harness();
  const cookie = await signIn(ORGANIZER);
  await pollMe(cookie, 30);
  for (let i = 0; i < 30; i++) {
    const res = await request("/api/v1/admin/stations", cookie);
    assert.equal(res.status, 200, `request ${i + 1}`);
  }

  await assertRateLimited(await request("/api/v1/admin/taps", cookie));
});

test("a request that fails its checks counts too", async () => {
  const { signIn, request } = await harness();
  const cookie = await signIn(PARTICIPANT);
  for (let i = 0; i < 60; i++) {
    const res = await request("/api/v1/me", cookie, { method: "PATCH", body: "{}" });
    assert.equal(res.status, 400, `request ${i + 1}`);
  }

  await assertRateLimited(await request("/api/v1/me", cookie));
  // Over the limit, a request is turned away before its body is checked.
  await assertRateLimited(await request("/api/v1/me", cookie, { method: "PATCH", body: "{}" }));
});

test("a request with no session isn't counted, and still gets 401", async () => {
  const { request } = await harness();
  for (let i = 0; i < 61; i++) {
    const res = await request("/api/v1/me");
    assert.equal(res.status, 401, `request ${i + 1}`);
    assert.deepEqual(await res.json(), { error: "unauthenticated" });
  }
});

test("/auth/* isn't counted, so a user over the limit can still log in and out", async () => {
  const { signIn, request, pollMe } = await harness();
  const cookie = await signIn(PARTICIPANT);
  await pollMe(cookie, 60);

  const again = await signIn(PARTICIPANT);
  const logout = await request("/auth/logout", cookie, { method: "POST" });
  assert.equal(logout.status, 204);
  // The count is the user's, not the cookie's, so logging in again doesn't start it over.
  await assertRateLimited(await request("/api/v1/me", again));
});
