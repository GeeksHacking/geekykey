import assert from "node:assert/strict";
import { test } from "vitest";
import type { Question } from "../../event/answers.ts";
import { connections } from "./schema.ts";
import { users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { answersGame } from "./answers.ts";
import { connectionsGame } from "./connections.ts";

// The connections game: two people each tap their phone on the other's token,
// and the GeekyKey Service hands each tap on (the API agreement's 11.10). The
// second tap makes the connection, which /me lists for both (8.1), with their
// match, and the map draws (9.10). connection-requests.test.ts covers accepting
// and declining the request the first tap sends.

/** The whole answer to a half, from a 200. */
const answerOf = async (res: Response | Promise<Response>) => {
  const answered = await res;
  assert.equal(answered.status, 200);
  return await answered.json();
};

/** The questions in the tests' answers game, so no test depends on the showcase's list. */
const QUESTIONS: readonly Question[] = [
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
  {
    id: "superpower",
    text: "Pick a superpower",
    choices: [
      { id: "fly", text: "Fly" },
      { id: "invisible", text: "Invisibility" },
    ],
  },
];

/** A connection as /me lists it. */
interface ConnectionBody {
  id: string;
  connected_at: string;
  display_name: string | null;
  bio: string | null;
  contact_line: string | null;
  avatar?: unknown;
  kind: string;
  match: number | null;
  shared: string[] | null;
  shared_at: string;
}

/** The Event Service with the tests' answers and connections games, on a clock the test moves. */
function harness({ withGame = true } = {}) {
  const clock = fakeClock("2026-11-12T08:00:00.000Z");
  const answers = answersGame(QUESTIONS);
  const app = testApp(
    {},
    {
      now: clock.now,
      answers,
      connections: withGame
        ? connectionsGame(answers, { rollDie: () => 4, pickGame: () => "dice" })
        : null,
    },
  );

  /** One half: `userId` tapped the token of `ownerId`, as the GeekyKey Service hands it on. */
  const prepared = new Set<string>();
  /** Complete the participant setup once; these tests exercise connections after setup. */
  const prepare = async (userId: string) => {
    if (prepared.has(userId)) return;
    const cookie = await signIn(userId);
    const res = await app.request("/api/v1/me", { headers: { Cookie: cookie } });
    const body = await res.json();
    screensSchemas.meResponseSchema.parse(body);
    const { user } = body as { user: { answers: Record<string, string> } };
    await answer(userId, { drink: "tea", hours: "owl", superpower: "fly", ...user.answers });
    prepared.add(userId);
  };
  const meet = async (
    userId: string,
    userKind: string | null,
    ownerId: string,
    ownerKind: string | null,
  ) => {
    await prepare(userId);
    return app.request("/geekykey/v1/meetings", {
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
  };

  /** The half's status, from a 200. */
  const statusOf = async (res: Response | Promise<Response>) =>
    ((await answerOf(res)) as { status: string }).status;

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
    return body as {
      points: number;
      connections: ConnectionBody[];
      connection_requests: unknown[];
    };
  };

  /** The user's answers, set through PATCH /api/v1/me. */
  const answer = async (userId: string, given: Record<string, string>) => {
    const res = await app.request("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: await signIn(userId) },
      body: JSON.stringify({ answers: given }),
    });
    assert.equal(res.status, 200);
  };

  /** Sets the user's bio, contact line or avatar look through PATCH /api/v1/me. */
  const setMe = async (
    userId: string,
    fields: { bio?: string; contact_line?: string; avatar?: Record<string, string> | null },
  ) => {
    const res = await app.request("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: await signIn(userId) },
      body: JSON.stringify(fields),
    });
    assert.equal(res.status, 200);
    screensSchemas.setDisplayNameResponseSchema.parse(await res.json());
  };

  return { app, clock, meet, statusOf, meOf, answer, setMe, signIn };
}

test("the owner's tap back connects the two, and /me lists it for both", async () => {
  const { clock, meet, statusOf, meOf } = harness();
  assert.equal(await statusOf(meet("alex", "E", "bea", "B")), "waiting");
  clock.advanceSeconds(30);
  assert.equal(await statusOf(meet("bea", "B", "alex", "E")), "connected");

  const alex = await meOf("alex");
  assert.deepEqual(
    alex.connections.map(({ connected_at, kind }) => ({ connected_at, kind })),
    [{ connected_at: "2026-11-12T08:00:30.000Z", kind: "B" }],
  );
  const bea = await meOf("bea");
  assert.deepEqual(
    bea.connections.map(({ connected_at, kind }) => ({ connected_at, kind })),
    [{ connected_at: "2026-11-12T08:00:30.000Z", kind: "E" }],
  );
});

test("the halves connect in either order", async () => {
  const { clock, meet, statusOf, meOf } = harness();
  // bea's ID sorts after alex's, so this is the other side of the pair from the test above.
  assert.equal(await statusOf(meet("bea", "B", "alex", "E")), "waiting");
  clock.advanceSeconds(90);
  assert.equal(await statusOf(meet("alex", "E", "bea", "B")), "connected");
  assert.equal((await meOf("alex")).connections.length, 1);
  assert.equal((await meOf("bea")).connections.length, 1);
});

test("a pair connects once, and their halves after it change nothing", async () => {
  const { clock, meet, statusOf, meOf } = harness();
  await meet("alex", "E", "bea", "B");
  assert.equal(await statusOf(meet("bea", "B", "alex", "E")), "connected");
  clock.advanceSeconds(600);
  assert.equal(await statusOf(meet("alex", "E", "bea", "B")), "already_connected");
  assert.equal(await statusOf(meet("bea", "B", "alex", "E")), "already_connected");
  assert.equal((await meOf("alex")).connections.length, 1);
  assert.equal((await meOf("bea")).connections.length, 1);
});

test("two of the same kind get same_kind, and nothing is kept", async () => {
  const { meet, statusOf, meOf } = harness();
  assert.equal(await statusOf(meet("alex", "E", "bea", "E")), "same_kind");
  assert.equal(await statusOf(meet("bea", "E", "alex", "E")), "same_kind");
  assert.deepEqual((await meOf("alex")).connections, []);
});

test("either person with no kind gets no_kind, and no request or connection is kept", async () => {
  const { meet, statusOf, meOf } = harness();
  assert.equal(await statusOf(meet("alex", "E", "bea", null)), "no_kind");
  assert.equal(await statusOf(meet("bea", null, "alex", "E")), "no_kind");
  assert.equal(await statusOf(meet("cai", null, "dan", null)), "no_kind");
  for (const id of ["alex", "bea", "cai", "dan"]) {
    const me = await meOf(id);
    assert.deepEqual(me.connections, []);
    assert.deepEqual(me.connection_requests, []);
  }
  // Once both have a kind, a tap back starts a request rather than completing one.
  assert.equal(await statusOf(meet("bea", "B", "alex", "E")), "waiting");
});

test("each side's own kind wins over the hand-off's, which becomes the kind of someone with none", async () => {
  const { meet, statusOf, signIn, app } = harness();
  // bea's first half gives her kind B, so a later token of kind E doesn't change it.
  await meet("bea", "B", "cai", "C");
  assert.equal(await statusOf(meet("alex", "E", "bea", "E")), "waiting");
  const me = await app.request("/api/v1/me", { headers: { Cookie: await signIn("bea") } });
  assert.equal(((await me.json()) as { user: { kind: string } }).user.kind, "B");
});

test("two halves at once, as on two instances, still connect the pair once", async () => {
  const { meet, statusOf, meOf } = harness();
  const pairs = [
    ["alex", "bea"],
    ["cai", "dan"],
    ["eve", "fay"],
  ] as const;
  const statuses = await Promise.all(
    pairs.flatMap(([a, b]) => [statusOf(meet(a, "E", b, "B")), statusOf(meet(b, "B", a, "E"))]),
  );
  for (let i = 0; i < pairs.length; i++) {
    assert.deepEqual([statuses[2 * i], statuses[2 * i + 1]].sort(), ["connected", "waiting"]);
  }
  for (const [a, b] of pairs) {
    assert.equal((await meOf(a)).connections.length, 1);
    assert.equal((await meOf(b)).connections.length, 1);
  }
});

test("two halves at once still connect when one brings no kind for someone who has one", async () => {
  const { meet, statusOf } = harness();
  const pairs = Array.from({ length: 8 }, (_, i) => [`a-${i}`, `b-${i}`] as const);
  // Each a-person has a kind already, from a half with someone else.
  for (const [a] of pairs) await meet(a, "E", "someone", "C");
  const statuses = await Promise.all(
    pairs.flatMap(([a, b]) => [
      // b's token page doesn't know a's kind, so it brings none.
      statusOf(meet(b, "B", a, null)),
      statusOf(meet(a, "E", b, "B")),
    ]),
  );
  for (let i = 0; i < pairs.length; i++) {
    assert.deepEqual([statuses[2 * i], statuses[2 * i + 1]].sort(), ["connected", "waiting"]);
  }
});

test("an Event Service without the connections game answers the meeting hand-off 404", async () => {
  const { meet } = harness({ withGame: false });
  const res = await meet("alex", "E", "bea", "B");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
});

test("a half needs the Event Service key, and a body the agreement allows", async () => {
  const { app, meet } = harness();
  const unkeyed = await app.request("/geekykey/v1/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "alex", user_kind: "E", owner_id: "bea", owner_kind: "B" }),
  });
  assert.equal(unkeyed.status, 401);
  const self = await meet("alex", "E", "alex", "B");
  assert.equal(self.status, 400);
  assert.equal(((await self.json()) as { error: string }).error, "validation_failed");
});

// The owner's name in the answer (BAC-143), so the token page can say whose token it is.

test("a half answers the owner's name with its status, whatever the status", async () => {
  const { meet, signIn } = harness();
  await signIn("alex");
  await signIn("bea");
  await signIn("cal");
  assert.deepEqual(await answerOf(meet("alex", "E", "bea", "B")), {
    status: "waiting",
    owner_name: "bea",
    owner_bio: null,
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("bea", "B", "alex", "E")), {
    status: "connected",
    owner_name: "alex",
    owner_bio: null,
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("alex", "E", "bea", "B")), {
    status: "already_connected",
    owner_name: "bea",
    owner_bio: null,
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("alex", "E", "cal", "E")), {
    status: "same_kind",
    owner_name: "cal",
    owner_bio: null,
    owner_avatar: null,
  });
});

/** `userId` sets their own name through PATCH /api/v1/me, as the passport does. */
const setName = async (
  { app, signIn }: ReturnType<typeof harness>,
  userId: string,
  name: string,
) => {
  const res = await app.request("/api/v1/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: await signIn(userId) },
    body: JSON.stringify({ display_name: name }),
  });
  assert.equal(res.status, 200);
};

test("a name the owner changed before the tap is the name a half answers", async () => {
  const service = harness();
  const { meet } = service;
  await setName(service, "bea", "Mei Lin");
  assert.deepEqual(await answerOf(meet("alex", "E", "bea", "B")), {
    status: "waiting",
    owner_name: "Mei Lin",
    owner_bio: null,
    owner_avatar: null,
  });
});

test("a half answers no name for an owner with only the default name, or who never logged in", async () => {
  const { meet } = harness();
  await testDb().insert(users).values({ id: "no-name", displayName: "Guest" });
  assert.deepEqual(await answerOf(meet("alex", "E", "no-name", "B")), {
    status: "waiting",
    owner_name: null,
    owner_bio: null,
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("alex", "E", "never-seen", "B")), {
    status: "waiting",
    owner_name: null,
    owner_bio: null,
    owner_avatar: null,
  });
});

test("a half answers Guest for an owner who chose it as their name", async () => {
  const service = harness();
  const { meet } = service;
  await setName(service, "bea", "Guest");
  assert.deepEqual(await answerOf(meet("alex", "E", "bea", "B")), {
    status: "waiting",
    owner_name: "Guest",
    owner_bio: null,
    owner_avatar: null,
  });
});

/** `userId` writes their own bio and contact line through PATCH /api/v1/me, as the dashboard does. */
const setProfileOf = async (
  { app, signIn }: ReturnType<typeof harness>,
  userId: string,
  profile: { bio: string | null; contact_line: string | null },
) => {
  const res = await app.request("/api/v1/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: await signIn(userId) },
    body: JSON.stringify(profile),
  });
  assert.equal(res.status, 200);
};

// The owner's bio in the answer (BAC-151): viewing a profile needs no accepting.

test("a half answers the owner's bio and never their contact line, whatever the status", async () => {
  const service = harness();
  const { meet, signIn } = service;
  await signIn("alex");
  await signIn("cal");
  await setProfileOf(service, "bea", {
    bio: "Sensors and sourdough",
    contact_line: "@bea on Telegram",
  });
  await setProfileOf(service, "cal", { bio: "Robot arms", contact_line: "@cal on Telegram" });

  assert.deepEqual(await answerOf(meet("alex", "E", "bea", "B")), {
    status: "waiting",
    owner_name: "bea",
    owner_bio: "Sensors and sourdough",
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("bea", "B", "alex", "E")), {
    status: "connected",
    owner_name: "alex",
    owner_bio: null,
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("alex", "E", "bea", "B")), {
    status: "already_connected",
    owner_name: "bea",
    owner_bio: "Sensors and sourdough",
    owner_avatar: null,
  });
  assert.deepEqual(await answerOf(meet("alex", "E", "cal", "E")), {
    status: "same_kind",
    owner_name: "cal",
    owner_bio: "Robot arms",
    owner_avatar: null,
  });
});

test("a half answers the bio as it is now, so a changed or cleared one shows", async () => {
  const service = harness();
  const { meet } = service;
  await setProfileOf(service, "bea", { bio: "First bio", contact_line: null });
  const bioAnswered = async () =>
    ((await answerOf(meet("alex", "E", "bea", "B"))) as { owner_bio: string | null }).owner_bio;
  assert.equal(await bioAnswered(), "First bio");

  await setProfileOf(service, "bea", { bio: "Second bio", contact_line: null });
  assert.equal(await bioAnswered(), "Second bio");

  await setProfileOf(service, "bea", { bio: null, contact_line: null });
  assert.equal(await bioAnswered(), null);
});

test("a half answers the owner's current avatar look whatever the status, or null for none", async () => {
  const { meet, signIn, setMe } = harness();
  const look = { character: "dress", skin: "light", hair: "blonde", suit: "ivory" };
  const lookAnswered = async (half: Promise<Response>) =>
    ((await answerOf(half)) as { owner_avatar: unknown }).owner_avatar;
  await signIn("alex");
  await setMe("bea", { avatar: look });

  assert.deepEqual(await lookAnswered(meet("alex", "E", "bea", "B")), look);
  assert.equal(await lookAnswered(meet("bea", "B", "alex", "E")), null);
  assert.deepEqual(await lookAnswered(meet("alex", "E", "bea", "B")), look);
  assert.equal(await lookAnswered(meet("alex", "E", "never-seen", "B")), null);

  await setMe("bea", { avatar: null });
  assert.equal(await lookAnswered(meet("alex", "E", "bea", "B")), null);
});

test("a half answers no bio for an owner this Event Service has never seen", async () => {
  const { meet } = harness();
  assert.deepEqual(await answerOf(meet("alex", "E", "never-seen", "B")), {
    status: "waiting",
    owner_name: null,
    owner_bio: null,
    owner_avatar: null,
  });
});

test("a half answers the bio of an owner with no name of their own", async () => {
  const service = harness();
  const { meet } = service;
  await testDb().insert(users).values({ id: "no-name", displayName: "Guest", bio: "Robot arms" });
  assert.deepEqual(await answerOf(meet("alex", "E", "no-name", "B")), {
    status: "waiting",
    owner_name: null,
    owner_bio: "Robot arms",
    owner_avatar: null,
  });
});

/** Pairs made by matchBetween() so far, so each call in one test has a pair of its own. */
let pairsMade = 0;

/**
 * Connects two new people, of kinds E and B, after each gives the answers
 * here, and gives the match both of them see.
 */
async function matchBetween(answersA: Record<string, string>, answersB: Record<string, string>) {
  const { meet, statusOf, meOf, answer } = harness();
  pairsMade += 1;
  const [a, b] = [`a-${pairsMade}`, `b-${pairsMade}`];
  if (Object.keys(answersA).length > 0) await answer(a, answersA);
  if (Object.keys(answersB).length > 0) await answer(b, answersB);
  await meet(a, "E", b, "B");
  assert.equal(await statusOf(meet(b, "B", a, "E")), "connected");
  const [seenByA, seenByB] = [(await meOf(a)).connections, (await meOf(b)).connections];
  assert.equal(seenByA.length, 1);
  assert.equal(seenByA[0]!.match, seenByB[0]!.match);
  return seenByA[0]!.match;
}

test("the same choice on every question both answered is a 100% match", async () => {
  const all = { drink: "tea", hours: "owl", superpower: "fly" };
  assert.equal(await matchBetween(all, all), 100);
});

test("a different choice on every question is a 0% match", async () => {
  assert.equal(
    await matchBetween(
      { drink: "tea", hours: "owl", superpower: "fly" },
      { drink: "coffee", hours: "bird", superpower: "invisible" },
    ),
    0,
  );
});

test("the match is rounded to a whole percent", async () => {
  assert.equal(
    await matchBetween(
      { drink: "tea", hours: "owl", superpower: "fly" },
      { drink: "tea", hours: "bird", superpower: "invisible" },
    ),
    33,
  );
});

test("the match is kept as it was made, since the connection fixes both people's answers", async () => {
  const { meet, meOf, answer, signIn, app } = harness();
  await answer("alex", { drink: "tea" });
  await answer("bea", { drink: "tea" });
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");
  const change = await app.request("/api/v1/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: await signIn("bea") },
    body: JSON.stringify({ answers: { drink: "coffee" } }),
  });
  assert.equal(change.status, 409);
  assert.equal((await meOf("alex")).connections[0]!.match, 100);
});

test("what the two share shows 2 minutes after they connect, and not before", async () => {
  const { clock, meet, meOf, answer } = harness();
  await answer("alex", { drink: "tea", hours: "owl", superpower: "fly" });
  await answer("bea", { drink: "tea", hours: "bird", superpower: "fly" });
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");

  const before = (await meOf("bea")).connections[0]!;
  assert.match(before.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(before, {
    id: before.id,
    connected_at: "2026-11-12T08:00:00.000Z",
    display_name: "alex",
    bio: null,
    contact_line: null,
    avatar: null,
    kind: "E",
    match: 67,
    dice: { your_roll: 4, their_roll: 4, result: "win" },
    reaction: null,
    shared: null,
    shared_at: "2026-11-12T08:02:00.000Z",
  });
  clock.advanceSeconds(119.999);
  assert.equal((await meOf("alex")).connections[0]!.shared, null);
  clock.advanceSeconds(0.001);
  assert.deepEqual((await meOf("alex")).connections[0]!.shared, ["drink", "superpower"]);
  assert.deepEqual((await meOf("bea")).connections[0]!.shared, ["drink", "superpower"]);
});

test("/me lists connections newest first, and each adds the same point, whatever the match", async () => {
  const { clock, meet, meOf, answer } = harness();
  await answer("alex", { drink: "tea" });
  await answer("bea", { drink: "tea" });
  await answer("cai", { drink: "coffee" });
  assert.equal((await meOf("alex")).points, 0);
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");
  clock.advanceSeconds(10);
  await meet("alex", "E", "cai", "C");
  await meet("cai", "C", "alex", "E");

  const alex = await meOf("alex");
  assert.deepEqual(
    alex.connections.map(({ kind, match }) => ({ kind, match })),
    [
      { kind: "C", match: 67 },
      { kind: "B", match: 100 },
    ],
  );
  assert.equal(alex.points, 2);
  assert.equal((await meOf("bea")).points, 1);
  assert.equal((await meOf("dan")).points, 0);
});

test("each connection gives the other person's name, and not their ID or answers", async () => {
  const { meet, meOf, answer } = harness();
  await testDb()
    .insert(users)
    .values([
      { id: "u_alex", displayName: "Alex Tan" },
      { id: "u_bea", displayName: "Mei Lin" },
    ]);
  await answer("u_alex", { drink: "tea" });
  await answer("u_bea", { drink: "coffee" });
  await meet("u_alex", "E", "u_bea", "B");
  await meet("u_bea", "B", "u_alex", "E");

  const alex = await meOf("u_alex");
  // The whole connection, so a new field has to be chosen here too.
  assert.deepEqual(alex.connections, [
    {
      id: alex.connections[0]!.id,
      connected_at: "2026-11-12T08:00:00.000Z",
      display_name: "Mei Lin",
      bio: null,
      contact_line: null,
      avatar: null,
      kind: "B",
      match: 67,
      dice: { your_roll: 4, their_roll: 4, result: "win" },
      reaction: null,
      shared: null,
      shared_at: "2026-11-12T08:02:00.000Z",
    },
  ]);
  assert.ok(!JSON.stringify(alex).includes("u_bea"));
  assert.equal((await meOf("u_bea")).connections[0]!.display_name, "Alex Tan");
});

test("a name set after connecting shows at the next /me, and the rest of the connection stays", async () => {
  const { app, meet, meOf, signIn } = harness();
  await testDb()
    .insert(users)
    .values([
      { id: "alex", displayName: "Alex Tan" },
      { id: "bea", displayName: "Guest", nameSetAt: "2026-11-12T07:00:00.000Z" },
    ]);
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");
  const [before] = (await meOf("alex")).connections;
  assert.equal(before!.display_name, "Guest");

  const renamed = await app.request("/api/v1/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: await signIn("bea") },
    body: JSON.stringify({ display_name: "Mei Lin" }),
  });
  assert.equal(renamed.status, 200);
  screensSchemas.setDisplayNameResponseSchema.parse(await renamed.json());

  assert.deepEqual((await meOf("alex")).connections, [{ ...before!, display_name: "Mei Lin" }]);
});

test("each person sees the other's bio and contact line once they connect", async () => {
  const { meet, meOf, setMe } = harness();
  await setMe("alex", { bio: "Robot arms", contact_line: "@alex" });
  await setMe("bea", { bio: "Sourdough and sensors", contact_line: "bea@example.com" });
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");

  const [toBea] = (await meOf("alex")).connections;
  assert.equal(toBea!.bio, "Sourdough and sensors");
  assert.equal(toBea!.contact_line, "bea@example.com");
  const [toAlex] = (await meOf("bea")).connections;
  assert.equal(toAlex!.bio, "Robot arms");
  assert.equal(toAlex!.contact_line, "@alex");
});

test("each connection gives the other person's current avatar look, or null for none", async () => {
  const { meet, meOf, setMe } = harness();
  const look = { character: "suit", skin: "deep", hair: "grey", suit: "navy" };
  const setLook = (avatar: Record<string, string> | null) => setMe("bea", { avatar });
  await setLook(look);
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");

  assert.deepEqual((await meOf("alex")).connections[0]!.avatar, look);
  assert.equal((await meOf("bea")).connections[0]!.avatar, null);

  const changed = { ...look, suit: "burgundy" };
  await setLook(changed);
  assert.deepEqual((await meOf("alex")).connections[0]!.avatar, changed);
  await setLook(null);
  assert.equal((await meOf("alex")).connections[0]!.avatar, null);
});

test("an edit after connecting shows at the next /me, clearing hides it, and the match stays", async () => {
  const { meet, meOf, setMe, answer } = harness();
  await answer("alex", { drink: "tea" });
  await answer("bea", { drink: "tea" });
  await setMe("bea", { bio: "Old bio", contact_line: "@old" });
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");
  const [before] = (await meOf("alex")).connections;
  assert.equal(before!.match, 100);

  await setMe("bea", { bio: "New bio", contact_line: "@new" });
  assert.deepEqual((await meOf("alex")).connections, [
    { ...before!, bio: "New bio", contact_line: "@new" },
  ]);

  await setMe("bea", { contact_line: "" });
  assert.deepEqual((await meOf("alex")).connections, [
    { ...before!, bio: "New bio", contact_line: null },
  ]);
});

test("an older connection to someone who never logged in has no bio or contact line", async () => {
  const { meOf } = harness();
  await testDb().insert(connections).values({
    userA: "alex",
    userB: "never-logged-in",
    kindA: "E",
    kindB: "B",
    connectedAt: "2026-11-12T08:00:00.000Z",
    shared: [],
  });
  const [connection] = (await meOf("alex")).connections;
  assert.equal(connection!.bio, null);
  assert.equal(connection!.contact_line, null);
});

test("no answer gives a contact line to someone who hasn't connected with its owner", async () => {
  const { app, meet, meOf, setMe, signIn } = harness();
  const CONTACT = "@bea-private-contact";
  await setMe("bea", { contact_line: CONTACT });
  const seen = async (res: Response | Promise<Response>) => {
    const answered = await res;
    assert.equal(answered.status, 200, answered.url);
    return await answered.text();
  };
  const organizer = { headers: { Cookie: await signIn("dev-organizer-1") } };

  // A tap gives a name, and the request gives its sender's name.
  const tap = await seen(meet("alex", "E", "bea", "B"));
  assert.ok(tap.includes("bea"));
  const answers = [
    tap,
    await seen(meet("bea", "B", "cai", "C")),
    JSON.stringify(await meOf("alex")),
    JSON.stringify(await meOf("cai")),
    await seen(app.request("/api/v1/admin/taps", organizer)),
    await seen(app.request("/api/v1/admin/groups", organizer)),
    await seen(app.request("/api/v1/admin/export.csv", organizer)),
    await seen(app.request("/api/v1/map", organizer)),
  ];
  for (const answer of answers) assert.ok(!answer.includes(CONTACT), answer);

  // bea's own /me does show it.
  assert.ok(JSON.stringify(await meOf("bea")).includes(CONTACT));
  // alex, whose request waits, gets it only once bea accepts: here, with a tap back.
  await meet("bea", "B", "alex", "E");
  assert.equal((await meOf("alex")).connections[0]!.contact_line, CONTACT);
});

test("the map gives no bio or contact line of anyone connected", async () => {
  const { app, meet, setMe, signIn } = harness();
  await setMe("bea", { bio: "Sourdough and sensors", contact_line: "@bea" });
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");
  const map = await app.request("/api/v1/map", {
    headers: { Cookie: await signIn("dev-organizer-1") },
  });
  assert.equal(map.status, 200);
  const body = await map.text();
  assert.ok(!body.includes("Sourdough") && !body.includes("@bea"), body);
});

test("older connections still show null or Guest when the other person has no name", async () => {
  const { meOf } = harness();
  await testDb().insert(users).values({ id: "no-name", displayName: "Guest" });
  await testDb()
    .insert(connections)
    .values([
      {
        userA: "alex",
        userB: "never-logged-in",
        kindA: "E",
        kindB: "B",
        connectedAt: "2026-11-12T08:00:00.000Z",
        shared: [],
      },
      {
        userA: "alex",
        userB: "no-name",
        kindA: "E",
        kindB: "B",
        connectedAt: "2026-11-12T08:00:10.000Z",
        shared: [],
      },
    ]);
  assert.deepEqual(
    (await meOf("alex")).connections.map(({ display_name }) => display_name),
    ["Guest", null],
  );
});

test("the map gives the count and the anonymous web, users numbered as they first connected", async () => {
  const { clock, meet, app, signIn } = harness();
  const connect = async (a: string, kindA: string, b: string, kindB: string) => {
    await meet(a, kindA, b, kindB);
    await meet(b, kindB, a, kindA);
    clock.advanceSeconds(1);
  };
  const readMap = async () => {
    const res = await app.request("/api/v1/map", {
      headers: { Cookie: await signIn("dev-organizer-1") },
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { connections: unknown }).connections;
  };
  assert.deepEqual(await readMap(), { count: 0, links: [] });

  await connect("zoe", "B", "yan", "E"); // zoe 1, yan 2, or the other way round.
  await connect("xia", "C", "zoe", "B"); // xia 3
  await connect("yan", "E", "wen", "B"); // wen 4
  const web = (await readMap()) as { count: number; links: [number, number][] };
  assert.equal(web.count, 3);
  assert.deepEqual(web.links[0], [1, 2]);
  // Whichever of zoe and yan is 1, xia is 3 and wen is 4.
  const zoe = web.links[1]![0];
  const yan = zoe === 1 ? 2 : 1;
  assert.deepEqual(web.links.slice(1), [
    [zoe, 3],
    [yan, 4],
  ]);
});

test("the map gives no name of anyone connected", async () => {
  const { app, meet, signIn } = harness();
  await testDb().insert(users).values({ id: "bea", displayName: "Mei Lin" });
  await meet("alex", "E", "bea", "B");
  await meet("bea", "B", "alex", "E");
  const map = await app.request("/api/v1/map", {
    headers: { Cookie: await signIn("dev-organizer-1") },
  });
  assert.equal(map.status, 200);
  assert.ok(!(await map.text()).includes("Mei Lin"));
});

test("without the connections game, the map leaves connections out and /me lists none", async () => {
  const { app, signIn } = harness({ withGame: false });
  const map = await app.request("/api/v1/map", {
    headers: { Cookie: await signIn("dev-organizer-1") },
  });
  assert.equal("connections" in ((await map.json()) as object), false);
  const me = await app.request("/api/v1/me", { headers: { Cookie: await signIn("alex") } });
  assert.deepEqual(((await me.json()) as { connections: unknown }).connections, []);
});
