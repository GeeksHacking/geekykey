import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { setConnectAcross } from "../../event/connect-across.ts";
import { groupMembers, participantGroups, userKinds, users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { answersGame } from "./answers.ts";
import { connectionsGame } from "./connections.ts";
import { meetingHalves } from "./schema.ts";

// Connection requests (BAC-149): tapping someone's token sends them a request,
// which their dashboard shows through /me, and they accept or decline it. A tap
// on the token of someone who has sent you a request counts as accepting it.

/** A connection request as /me lists it. */
interface RequestBody {
  id: string;
  display_name: string;
  bio: string | null;
  requested_at: string;
}

/** The Event Service with the connections game, on a clock the test moves. */
function harness() {
  const clock = fakeClock("2026-11-12T08:00:00.000Z");
  const answers = answersGame([]);
  const app = testApp({}, { now: clock.now, answers, connections: connectionsGame(answers) });

  /** `userId` tapped the token of `ownerId`, as the GeekyKey Service hands it on (11.10). */
  const tap = async (
    userId: string,
    userKind: string | null,
    ownerId: string,
    ownerKind: string | null,
  ) => {
    // Meetings now require a name; these request tests use an event without questions.
    await testDb()
      .insert(users)
      .values({ id: userId, displayName: userId })
      .onDuplicateKeyUpdate({ set: { id: userId } });
    const res = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        user_kind: userKind,
        owner_id: ownerId,
        owner_kind: ownerKind,
      }),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { status: string }).status;
  };

  /** Signs in through dev-login, as a user it adds, and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    await testDb()
      .insert(users)
      .values({ id: userId, displayName: userId })
      .onDuplicateKeyUpdate({ set: { id: userId } });
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };

  /** The user's /me, which must be a 200 that the Event screens accept. */
  const meOf = async (userId: string) => {
    const res = await app.request("/api/v1/me", { headers: { Cookie: await signIn(userId) } });
    assert.equal(res.status, 200);
    const body = await res.json();
    screensSchemas.meResponseSchema.parse(body);
    return body as { connection_requests: RequestBody[]; connections: unknown[] };
  };

  /** The one request waiting for the user. */
  const requestFor = async (userId: string) => {
    const { connection_requests: waiting } = await meOf(userId);
    assert.equal(waiting.length, 1);
    return waiting[0]!;
  };

  const answerRequest = async (userId: string, requestId: string, action: "accept" | "decline") =>
    app.request(`/api/v1/me/connection-requests/${requestId}/${action}`, {
      method: "POST",
      headers: { Cookie: await signIn(userId) },
    });

  /** The user accepts a request, which must be a 200 that the Event screens accept. */
  const accept = async (userId: string, requestId: string) => {
    const res = await answerRequest(userId, requestId, "accept");
    assert.equal(res.status, 200);
    const body = await res.json();
    screensSchemas.acceptConnectionRequestResponseSchema.parse(body);
    return (body as { status: string }).status;
  };

  /** What connections need, as the Groups screen's switch sets it (BAC-140). */
  const setRule = (rule: "token_kinds" | "groups") => setConnectAcross(testDb(), rule);

  /** Puts the users in one new group. */
  const placeInGroups = async (...userIds: string[]) => {
    const id = crypto.randomUUID();
    const at = clock.now().toISOString();
    await testDb()
      .insert(participantGroups)
      .values({ id, name: "Group 1", tags: [], createdAt: at });
    await testDb()
      .insert(groupMembers)
      .values(userIds.map((userId) => ({ userId, groupId: id, joinedAt: at })));
  };

  return {
    app,
    clock,
    tap,
    signIn,
    meOf,
    requestFor,
    answerRequest,
    accept,
    setRule,
    placeInGroups,
  };
}

/** A user whose name the event shows. */
const named = (id: string, displayName: string) =>
  testDb().insert(users).values({ id, displayName });

test("a request gives the tapper's current bio, and no contact line, user ID or answers", async () => {
  const { tap, meOf } = harness();
  await testDb().insert(users).values({
    id: "alex",
    displayName: "Alex Tan",
    bio: "Building a robot arm",
    contactLine: "@alex on Telegram",
  });
  assert.equal(await tap("alex", "E", "bea", "B"), "waiting");

  const [request] = (await meOf("bea")).connection_requests;
  assert.deepEqual(Object.keys(request!).sort(), ["bio", "display_name", "id", "requested_at"]);
  assert.equal(request!.bio, "Building a robot arm");
  assert.equal(JSON.stringify(request).includes("@alex"), false);

  // It's the current one, read at each poll, so a change or a clear shows.
  await testDb().update(users).set({ bio: "Sensors now" }).where(eq(users.id, "alex"));
  assert.equal((await meOf("bea")).connection_requests[0]!.bio, "Sensors now");
  await testDb().update(users).set({ bio: null }).where(eq(users.id, "alex"));
  assert.equal((await meOf("bea")).connection_requests[0]!.bio, null);
});

test("a request from someone with no bio gives null", async () => {
  const { tap, meOf } = harness();
  await named("alex", "Alex Tan");
  await tap("alex", "E", "bea", "B");
  assert.equal((await meOf("bea")).connection_requests[0]!.bio, null);
});

test("tapping a token sends its owner a request, with the tapper's name and an ID of its own", async () => {
  const { clock, tap, meOf } = harness();
  await named("alex", "Alex Tan");
  assert.equal(await tap("alex", "E", "bea", "B"), "waiting");

  const [request, ...others] = (await meOf("bea")).connection_requests;
  assert.deepEqual(others, []);
  assert.equal(request!.display_name, "Alex Tan");
  assert.equal(request!.requested_at, clock.now().toISOString());
  assert.notEqual(request!.id, "");
  assert.equal(JSON.stringify(request).includes("alex"), false);
  // A request goes one way: it's for the owner, and the tapper's screens don't change.
  assert.deepEqual((await meOf("alex")).connection_requests, []);
});

test("someone with no name sends no request", async () => {
  const { tap, meOf } = harness();
  await named("no-name", "Guest");
  assert.equal(await tap("no-name", "E", "bea", "B"), "answers_needed");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
});

test("a request shows the tapper's current name, and the newest comes first", async () => {
  const { clock, tap, meOf } = harness();
  await named("alex", "Alex Tan");
  await named("cai", "Cai");
  await tap("alex", "E", "bea", "B");
  clock.advanceSeconds(5);
  await tap("cai", "G", "bea", "B");
  await testDb().update(users).set({ displayName: "Lex" }).where(eq(users.id, "alex"));
  assert.deepEqual(
    (await meOf("bea")).connection_requests.map(({ display_name }) => display_name),
    ["Cai", "Lex"],
  );
});

test("tapping again while a request waits makes no second request, and keeps the first", async () => {
  const { clock, tap, requestFor } = harness();
  await tap("alex", "E", "bea", "B");
  const first = await requestFor("bea");
  clock.advanceSeconds(300);
  assert.equal(await tap("alex", "E", "bea", "B"), "waiting");
  assert.deepEqual(await requestFor("bea"), first);
});

test("tapping back connects straight away, however long the request has waited", async () => {
  const { clock, tap, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  clock.advanceSeconds(6 * 60 * 60);
  assert.equal(await tap("bea", "B", "alex", "E"), "connected");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.equal((await meOf("alex")).connections.length, 1);
  assert.equal((await meOf("bea")).connections.length, 1);
});

test("a tap back the rule refuses takes the request with it, as an accept does", async () => {
  const { tap, meOf, setRule } = harness();
  await tap("alex", "E", "bea", "B");
  await setRule("groups");
  assert.equal(await tap("bea", "B", "alex", "E"), "no_group");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.deepEqual((await meOf("alex")).connections, []);
});

test("accepting connects the two, and both see the connection", async () => {
  const { clock, tap, requestFor, accept, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  const { id } = await requestFor("bea");
  clock.advanceSeconds(10);
  assert.equal(await accept("bea", id), "connected");

  assert.deepEqual((await meOf("bea")).connection_requests, []);
  for (const user of ["alex", "bea"]) {
    const { connections } = await meOf(user);
    assert.deepEqual(
      connections.map((connection) => (connection as { connected_at: string }).connected_at),
      [clock.now().toISOString()],
    );
  }
  assert.equal(await tap("alex", "E", "bea", "B"), "already_connected");
});

test("a request more than 2 minutes old can still be accepted", async () => {
  const { clock, tap, requestFor, accept } = harness();
  await tap("alex", "E", "bea", "B");
  const { id } = await requestFor("bea");
  clock.advanceSeconds(24 * 60 * 60);
  assert.equal(await accept("bea", id), "connected");
});

test("declining removes the request and tells the tapper nothing, and tapping again sends a new one", async () => {
  const { tap, requestFor, answerRequest, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  const declined = await requestFor("bea");
  const alexBefore = await meOf("alex");

  const res = await answerRequest("bea", declined.id, "decline");
  assert.equal(res.status, 204);
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.deepEqual((await meOf("bea")).connections, []);
  assert.deepEqual(await meOf("alex"), alexBefore);

  assert.equal(await tap("alex", "E", "bea", "B"), "waiting");
  assert.notEqual((await requestFor("bea")).id, declined.id);
});

test("after a decline, the one who declined tapping back only sends their own request", async () => {
  const { tap, requestFor, answerRequest, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  await answerRequest("bea", (await requestFor("bea")).id, "decline");
  assert.equal(await tap("bea", "B", "alex", "E"), "waiting");
  assert.equal((await requestFor("alex")).display_name, "bea");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
});

test("accepting after the two stop passing the rule makes no connection, says why, and the request goes", async () => {
  const { tap, requestFor, accept, meOf, setRule, placeInGroups } = harness();
  await tap("alex", "E", "bea", "B");
  const notPlaced = await requestFor("bea");
  await setRule("groups");
  assert.equal(await accept("bea", notPlaced.id), "no_group");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.deepEqual((await meOf("alex")).connections, []);

  await setRule("token_kinds");
  await tap("alex", "E", "bea", "B");
  const sameGroup = await requestFor("bea");
  await placeInGroups("alex", "bea");
  await setRule("groups");
  assert.equal(await accept("bea", sameGroup.id), "same_group");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.deepEqual((await meOf("bea")).connections, []);
});

test("accepting across token kinds is refused when both have ended up with one kind", async () => {
  const { tap, requestFor, accept, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  const { id } = await requestFor("bea");
  await testDb().update(userKinds).set({ kind: "E" }).where(eq(userKinds.userId, "bea"));
  assert.equal(await accept("bea", id), "same_kind");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.deepEqual((await meOf("alex")).connections, []);
});

test("two accepts at once make one connection", async () => {
  const { tap, requestFor, answerRequest, meOf } = harness();
  const pairs = Array.from({ length: 6 }, (_, i) => [`a-${i}`, `b-${i}`] as const);
  for (const [a, b] of pairs) await tap(a, "E", b, "B");
  const ids = await Promise.all(pairs.map(async ([, b]) => (await requestFor(b)).id));
  const answers = await Promise.all(
    pairs.flatMap(([, b], i) => [
      answerRequest(b, ids[i]!, "accept"),
      answerRequest(b, ids[i]!, "accept"),
    ]),
  );
  const outcomes = await Promise.all(
    answers.map(async (res) =>
      res.status === 200
        ? (
            screensSchemas.acceptConnectionRequestResponseSchema.parse(await res.json()) as {
              status: string;
            }
          ).status
        : res.status,
    ),
  );
  for (let i = 0; i < pairs.length; i++) {
    const [first, second] = [outcomes[2 * i], outcomes[2 * i + 1]];
    // The later one finds the connection made, or the request gone already.
    assert.deepEqual([first, second].filter((outcome) => outcome === "connected").length, 1);
    for (const outcome of [first, second]) {
      assert.ok(["connected", "already_connected", 404].includes(outcome as string | number));
    }
    assert.equal((await meOf(pairs[i]![0])).connections.length, 1);
    assert.equal((await meOf(pairs[i]![1])).connections.length, 1);
  }
});

test("an accept and a tap back at once make one connection", async () => {
  const { tap, requestFor, answerRequest, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  const { id } = await requestFor("bea");
  await Promise.all([answerRequest("bea", id, "accept"), tap("bea", "B", "alex", "E")]);
  assert.equal((await meOf("alex")).connections.length, 1);
  assert.equal((await meOf("bea")).connections.length, 1);
});

test("only the person a request waits for can answer it", async () => {
  const { tap, requestFor, answerRequest, meOf } = harness();
  await tap("alex", "E", "bea", "B");
  const { id } = await requestFor("bea");
  for (const user of ["alex", "cai"]) {
    for (const action of ["accept", "decline"] as const) {
      const res = await answerRequest(user, id, action);
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: "not_found" });
    }
  }
  assert.deepEqual((await requestFor("bea")).id, id);
  assert.deepEqual((await meOf("alex")).connections, []);
});

test("an unknown request answers 404, and answering needs a session", async () => {
  const { app, answerRequest } = harness();
  assert.equal((await answerRequest("bea", "no-such-request", "accept")).status, 404);
  assert.equal((await answerRequest("bea", "no-such-request", "decline")).status, 404);
  const unsigned = await app.request("/api/v1/me/connection-requests/any/accept", {
    method: "POST",
  });
  assert.equal(unsigned.status, 401);
});

test("an old half with no request ID is no request, and counts for nothing", async () => {
  const { tap, meOf, requestFor } = harness();
  // What the version before BAC-149 wrote, which stays in the row until the event is cleared.
  await testDb()
    .insert(meetingHalves)
    .values({ userA: "alex", userB: "bea", aMetAt: "2026-11-12T07:59:00.000Z" });
  assert.deepEqual((await meOf("bea")).connection_requests, []);
  assert.equal(await tap("bea", "B", "alex", "E"), "waiting");
  assert.equal((await requestFor("alex")).display_name, "bea");
  assert.deepEqual((await meOf("bea")).connection_requests, []);
});

test("without the connections game, /me lists no requests and answering one is a 404", async () => {
  const app = testApp({}, { answers: null, connections: null });
  await testDb().insert(users).values({ id: "bea", displayName: "Bea" });
  const login = await app.request("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "bea" }),
  });
  const cookie = (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  const me = await app.request("/api/v1/me", { headers: { Cookie: cookie } });
  const body = await me.json();
  screensSchemas.meResponseSchema.parse(body);
  assert.deepEqual((body as { connection_requests: unknown }).connection_requests, []);
  const res = await app.request("/api/v1/me/connection-requests/any/accept", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
});
