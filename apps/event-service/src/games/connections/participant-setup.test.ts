import assert from "node:assert/strict";
import { test } from "vitest";
import { answersGame } from "./answers.ts";
import { connectionsGame } from "./connections.ts";
import { TEST_EVENT_SERVICE_KEY, testApp, testDb, screensSchemas } from "../../test-helpers.ts";

import { answers as storedAnswers, meetingHalves } from "./schema.ts";
import { users, userKinds } from "../../event/schema.ts";

async function acceptance(response: Response | Promise<Response>) {
  const res = await response;
  assert.equal(res.status, 200);
  const body = await res.json();
  screensSchemas.acceptConnectionRequestResponseSchema.parse(body);
  return body as { status: string };
}

const QUESTIONS = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
  {
    id: "hours",
    text: "Night owl or early bird?",
    choices: [
      { id: "owl", text: "Night owl" },
      { id: "bird", text: "Early bird" },
    ],
  },
];

function harness(withAnswers = true) {
  const answers = withAnswers ? answersGame(QUESTIONS) : null;
  const app = testApp({}, { answers, connections: connectionsGame(answers) });
  const tap = async (userId: string, ownerId: string, kind: string | null = "E") => {
    const res = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        user_kind: kind,
        owner_id: ownerId,
        owner_kind: "B",
      }),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { status: string }).status;
  };
  const login = async (userId: string) => {
    await testDb()
      .insert(users)
      .values({ id: userId, displayName: "Guest" })
      .onDuplicateKeyUpdate({ set: { id: userId } });
    const res = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(res.status, 204);
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const patch = async (cookie: string, body: unknown) => {
    const res = await app.request("/api/v1/me", {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200);
    screensSchemas.setDisplayNameResponseSchema.parse(await res.json());
  };
  const me = async (cookie: string) => {
    const res = await app.request("/api/v1/me", { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    screensSchemas.meResponseSchema.parse(body);
    return body as { connection_requests: { id: string }[]; connections: { match: number }[] };
  };
  return { app, tap, login, patch, me };
}

test("an unfinished tap keeps no request, and the same tap works after the name and every answer", async () => {
  const { tap, login, patch, me } = harness();
  assert.equal(await tap("alex", "bea", null), "answers_needed");
  const alex = await login("alex");
  const bea = await login("bea");
  assert.deepEqual((await me(bea)).connection_requests, []);
  await patch(alex, { display_name: "Alex", answers: { drink: "tea" } });
  assert.equal(await tap("alex", "bea"), "answers_needed");
  assert.deepEqual((await me(bea)).connection_requests, []);
  await patch(alex, { answers: { hours: "owl" } });
  assert.equal(await tap("alex", "bea"), "waiting");
  assert.equal((await me(bea)).connection_requests.length, 1);
  assert.equal(await tap("bea", "alex", "B"), "answers_needed");
  assert.deepEqual((await me(alex)).connections, []);
  await patch(bea, { display_name: "Bea", answers: { drink: "coffee", hours: "owl" } });
  assert.equal(await tap("bea", "alex", "B"), "connected");
  assert.equal((await me(alex)).connections[0]!.match, 50);
});

test("accepting a request also needs the recipient's name and every answer, and can be retried", async () => {
  const { app, tap, login, patch, me } = harness();
  const alex = await login("alex");
  const bea = await login("bea");
  await patch(alex, { display_name: "Alex", answers: { drink: "tea", hours: "owl" } });
  assert.equal(await tap("alex", "bea"), "waiting");
  const request = (await me(bea)).connection_requests[0]!;
  const accept = () =>
    app.request(`/api/v1/me/connection-requests/${request.id}/accept`, {
      method: "POST",
      headers: { Cookie: bea },
    });
  assert.deepEqual(await acceptance(accept()), { status: "answers_needed" });
  assert.deepEqual((await me(alex)).connections, []);
  assert.equal((await me(bea)).connection_requests[0]!.id, request.id);
  await patch(bea, { display_name: "Bea", answers: { drink: "tea", hours: "bird" } });
  assert.deepEqual(await acceptance(accept()), { status: "connected" });
  assert.equal((await me(bea)).connections[0]!.match, 50);
});

test("an event with no answers game needs only a name, including a name explicitly set to Guest", async () => {
  const { tap, login, patch } = harness(false);
  const alex = await login("alex");
  assert.equal(await tap("alex", "bea"), "answers_needed");
  await patch(alex, { display_name: "Guest" });
  assert.equal(await tap("alex", "bea"), "waiting");
});

test("having every answer without a name still refuses a tap", async () => {
  const { tap, login, patch } = harness();
  const cookie = await login("alex");
  await patch(cookie, { answers: { drink: "tea", hours: "owl" } });
  assert.equal(await tap("alex", "bea"), "answers_needed");
});

test("setup is checked before groups, and organisers keep their meeting behaviour", async () => {
  const { app, tap, login } = harness();
  const organizer = await login("dev-organizer-1");
  const rule = await app.request("/api/v1/admin/connections/rule", {
    method: "PUT",
    headers: { Cookie: organizer, "Content-Type": "application/json" },
    body: JSON.stringify({ connect_across: "groups" }),
  });
  assert.equal(rule.status, 200);
  screensSchemas.connectionRuleSchema.parse(await rule.json());
  assert.equal(await tap("alex", "bea"), "answers_needed");
  assert.equal(await tap("dev-organizer-1", "bea"), "no_group");
});

test("older locked answers can be completed, while existing choices stay locked", async () => {
  const { app, login, patch } = harness();
  const cookie = await login("alex");
  await testDb()
    .insert(storedAnswers)
    .values({ userId: "alex", choices: { drink: "tea" }, fixedAt: "2026-11-05T08:00:00.000Z" });
  await patch(cookie, { answers: { hours: "owl" } });
  const change = await app.request("/api/v1/me", {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ answers: { drink: "coffee" } }),
  });
  assert.equal(change.status, 409);
  assert.deepEqual(await change.json(), { error: "answers_fixed" });
});

test.each(["tap", "accept"])(
  "an older request from an unfinished sender cannot connect through %s",
  async (action) => {
    const { app, tap, login, patch, me } = harness();
    const alex = await login("alex");
    const bea = await login("bea");
    await patch(bea, { display_name: "Bea", answers: { drink: "tea", hours: "owl" } });
    const id = crypto.randomUUID();
    await testDb()
      .insert(userKinds)
      .values([
        { userId: "alex", kind: "E" },
        { userId: "bea", kind: "B" },
      ]);
    await testDb()
      .insert(meetingHalves)
      .values({ userA: "alex", userB: "bea", aMetAt: "2026-11-05T08:00:00.000Z", requestId: id });
    const complete = async () => {
      if (action === "tap") return tap("bea", "alex", "B");
      return (
        await acceptance(
          app.request(`/api/v1/me/connection-requests/${id}/accept`, {
            method: "POST",
            headers: { Cookie: bea },
          }),
        )
      ).status;
    };
    assert.equal(await complete(), "answers_needed");
    assert.deepEqual((await me(bea)).connections, []);
    assert.equal((await me(bea)).connection_requests[0]!.id, id);
    await patch(alex, { display_name: "Alex", answers: { drink: "coffee", hours: "owl" } });
    assert.equal(await complete(), "connected");
    assert.equal((await me(bea)).connections[0]!.match, 50);
  },
);
