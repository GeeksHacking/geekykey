import assert from "node:assert/strict";
import { test } from "vitest";
import { tokens } from "../../claims-stand-in/schema.ts";
import type { Question } from "../../event/answers.ts";
import { userKinds, users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { answersGame } from "./answers.ts";
import { connectionsGame } from "./connections.ts";

// Showcase mode (the API agreement's 9.21, for the next version) and the reset of every
// participant (9.22), for demoing connections at a booth with the same phones and tokens.

const ORGANIZER = "dev-organizer-1";
const MAP_SCREEN = "map-screen-1";

const { groupBoardResponseSchema, meResponseSchema, showcaseSettingSchema } = screensSchemas;
const { resetParticipantsResponseSchema } = screensSchemas;

const QUESTIONS: readonly Question[] = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
];

/** A connection as /me lists it. */
interface ConnectionBody {
  id: string;
  connected_at: string;
  match: number | null;
  dice: { your_roll: number; their_roll: number } | null;
  shared: string[] | null;
}

/** The Event Service with the answers and connections games, on a clock the test moves. */
async function harness() {
  const clock = fakeClock("2026-11-17T09:00:00.000Z");
  const rolls = [1, 2, 3, 4, 5, 6];
  const answers = answersGame(QUESTIONS);
  const app = testApp(
    { MAP_SCREENS: MAP_SCREEN },
    {
      now: clock.now,
      answers,
      connections: connectionsGame(answers, {
        rollDie: () => rolls.shift() ?? 6,
        pickGame: () => "dice",
      }),
    },
  );
  const people = ["alex", "bea", "chen"];
  await testDb()
    .insert(users)
    .values(
      [ORGANIZER, MAP_SCREEN, ...people].map((id) => ({
        id,
        displayName: id,
        nameSetAt: "2026-11-17T08:00:00.000Z",
      })),
    );

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string) => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return login.headers.get("set-cookie")!.split(";")[0]!;
  };

  /** Sends a request as `userId`, or with a cookie already given. */
  const send = async (
    userId: string,
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
  ) => {
    cookie ??= await signIn(userId);
    return app.request(path, {
      method,
      headers: {
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };

  /** Answers the one question, as PATCH /api/v1/me takes it, and gives the status. */
  const answer = async (userId: string, choice: "tea" | "coffee") =>
    (await send(userId, "PATCH", "/api/v1/me", { answers: { drink: choice } })).status;

  /** One half: `userId` tapped the token of `ownerId`, both tokens of kind E. */
  const meet = async (userId: string, ownerId: string) => {
    const response = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        user_kind: "E",
        owner_id: ownerId,
        owner_kind: "E",
      }),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { status: string }).status;
  };

  /** /me, which the Event screens must accept. */
  const me = async (userId: string) => {
    const response = await send(userId, "GET", "/api/v1/me");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    meResponseSchema.parse(body);
    return body as { showcase: boolean; connections: ConnectionBody[] };
  };

  /** The Groups screen's switch, which must answer 200 with the new setting. */
  const showcase = async (on: boolean) => {
    const response = await send(ORGANIZER, "PUT", "/api/v1/admin/showcase", { showcase: on });
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    showcaseSettingSchema.parse(body);
    assert.deepEqual(body, { showcase: on });
  };

  /** The organizers' board, read as the Groups screen reads it. */
  const board = async () => {
    const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    groupBoardResponseSchema.parse(body);
    return body as { showcase: boolean };
  };

  for (const person of people) assert.equal(await answer(person, "tea"), 200);
  return { clock, signIn, send, answer, meet, me, showcase, board };
}

test("a new event has showcase mode off, and runs the connection rule", async () => {
  const { meet, me, board } = await harness();
  assert.equal((await board()).showcase, false);
  assert.equal((await me("alex")).showcase, false);

  // Across token kinds, as a new event starts, two tokens of one kind never connect.
  assert.equal(await meet("alex", "bea"), "same_kind");
  assert.deepEqual((await me("alex")).connections, []);
});

test("in showcase mode two people with tokens of one kind connect", async () => {
  const { meet, me, showcase, board } = await harness();
  await showcase(true);
  assert.equal((await board()).showcase, true);
  assert.equal((await me("alex")).showcase, true);

  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");
  assert.equal((await me("alex")).connections.length, 1);
});

test("in showcase mode a pair already connected connects again, with a new challenge in place of the old", async () => {
  const { clock, meet, me, showcase } = await harness();
  await showcase(true);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");
  const [first] = (await me("alex")).connections;

  clock.advanceSeconds(60);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");

  const again = (await me("alex")).connections;
  assert.equal(again.length, 1);
  assert.notEqual(again[0]!.id, first!.id);
  assert.equal(again[0]!.connected_at, "2026-11-17T09:01:00.000Z");
  // The dice were rolled again: 1 and 2 the first time, 3 and 4 now.
  assert.deepEqual(first!.dice && [first!.dice.your_roll, first!.dice.their_roll], [1, 2]);
  assert.deepEqual(again[0]!.dice && [again[0]!.dice.your_roll, again[0]!.dice.their_roll], [3, 4]);
  assert.equal((await me("bea")).connections.length, 1);
});

test("in showcase mode accepting a request from someone already connected makes the connection again", async () => {
  const { send, meet, me, showcase } = await harness();
  await showcase(true);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");

  assert.equal(await meet("alex", "bea"), "waiting");
  const request = (await (await send("bea", "GET", "/api/v1/me")).json()) as {
    connection_requests: { id: string }[];
  };
  assert.equal(request.connection_requests.length, 1);
  const accepted = await send(
    "bea",
    "POST",
    `/api/v1/me/connection-requests/${request.connection_requests[0]!.id}/accept`,
  );
  assert.equal(accepted.status, 200);
  assert.equal(((await accepted.json()) as { status: string }).status, "connected");
  assert.equal((await me("bea")).connections.length, 1);
});

test("once showcase mode is off, the connection rule runs again", async () => {
  const { meet, showcase } = await harness();
  await showcase(true);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");
  await showcase(false);
  assert.equal(await meet("alex", "bea"), "same_kind");
});

test("in showcase mode answers stay open after a connection, and what the two share shows at once", async () => {
  const { answer, meet, me, showcase } = await harness();
  await showcase(true);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");
  const [made] = (await me("alex")).connections;
  assert.equal(made!.match, 100);
  assert.deepEqual(made!.shared, ["drink"]);

  // A new answer is kept, and the next connection works its match out from it.
  assert.equal(await answer("alex", "coffee"), 200);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");
  const [again] = (await me("alex")).connections;
  assert.equal(again!.match, 0);
  assert.deepEqual(again!.shared, []);

  // With showcase mode off, the connection has fixed the answers, as it always has.
  await showcase(false);
  assert.equal(await answer("alex", "tea"), 409);
});

test("the reset removes every participant and their tokens, and keeps the organizers, the map screens and the settings", async () => {
  const { signIn, send, meet, showcase, board } = await harness();
  await showcase(true);
  assert.equal(await meet("alex", "bea"), "waiting");
  assert.equal(await meet("bea", "alex"), "connected");
  const alexCookie = await signIn("alex");
  const db = testDb();
  await db.insert(tokens).values([
    { uid: "04AAAAAAAAAAA1", userId: "alex" },
    { uid: "04AAAAAAAAAAA2", userId: ORGANIZER },
  ]);
  await db.insert(userKinds).values({ userId: ORGANIZER, kind: "E" });

  const response = await send(ORGANIZER, "POST", "/api/v1/admin/participants/reset", {
    confirm: "reset",
  });
  assert.equal(response.status, 200);
  const body: unknown = await response.json();
  resetParticipantsResponseSchema.parse(body);
  assert.deepEqual(body, { participants: 3 });

  const left = await db.select({ id: users.id }).from(users).orderBy(users.id);
  assert.deepEqual(
    left.map(({ id }) => id),
    [ORGANIZER, MAP_SCREEN],
  );
  assert.deepEqual(await db.select({ uid: tokens.uid }).from(tokens), [{ uid: "04AAAAAAAAAAA2" }]);
  // The connection kept alex's and bea's kinds, which go with them.
  assert.deepEqual(await db.select({ userId: userKinds.userId }).from(userKinds), [
    { userId: ORGANIZER },
  ]);
  // Someone reset is signed out at their next request, and the settings stay.
  assert.equal((await send("alex", "GET", "/api/v1/me", undefined, alexCookie)).status, 401);
  assert.equal((await board()).showcase, true);
});

test("the reset needs its confirmation, and only organizers may send it", async () => {
  const { send } = await harness();
  const unconfirmed = await send(ORGANIZER, "POST", "/api/v1/admin/participants/reset", {});
  assert.equal(unconfirmed.status, 400);
  const byParticipant = await send("alex", "POST", "/api/v1/admin/participants/reset", {
    confirm: "reset",
  });
  assert.equal(byParticipant.status, 403);
  assert.equal((await testDb().select().from(users)).length, 5);
});
