import assert from "node:assert/strict";
import { test } from "vitest";
import type { Question } from "../../event/answers.ts";
import { screensSchemas, setupFixture, testApp, testDb } from "../../test-helpers.ts";
import { answersGame } from "./answers.ts";

// The answers game through GET and PATCH /api/v1/me (the API agreement's 8.1
// and 8.7), and fixAnswers(), which the connections game calls when it makes
// a connection.

/** The questions in the tests' answers game, so no test depends on the grad tea's list. */
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
    id: "superpower",
    text: "Pick a superpower",
    choices: [
      { id: "fly", text: "Fly" },
      { id: "invisible", text: "Invisibility" },
      { id: "minds", text: "Reading minds" },
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

const game = answersGame(QUESTIONS);
const app = testApp({}, { answers: game });

/** The parts of GET /api/v1/me these tests read. */
interface MeBody {
  user: { display_name: string; answers: Record<string, string> };
  questions: Question[] | null;
}

/** Ways to call /api/v1/me on `target` as a signed-in user. */
function clientOf(target: ReturnType<typeof testApp>) {
  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    const login = await target.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };

  /** The /me body, which must be a 200 that the Event screens accept. */
  const meAs = async (userId: string): Promise<MeBody> => {
    const res = await target.request("/api/v1/me", {
      headers: { Cookie: await signIn(userId) },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    screensSchemas.meResponseSchema.parse(body);
    return body as MeBody;
  };

  /** PATCH /api/v1/me with `body` as JSON. */
  const patchMe = (body: unknown, cookie: string) =>
    target.request("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });

  return { signIn, meAs, patchMe };
}

/** One participant, Alex, and the ways to call /me on the tests' app. */
async function harness() {
  const fx = await setupFixture();
  return { ...fx, ...clientOf(app) };
}

/** PATCH /api/v1/me's 400, with the path of each issue. */
async function issuePaths(res: Response): Promise<(string | number)[][]> {
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; issues: { path: (string | number)[] }[] };
  assert.equal(json.error, "validation_failed");
  return json.issues.map((issue) => issue.path);
}

/** The user's answers in PATCH /api/v1/me's 200, which must be one. */
async function answersIn(res: Response): Promise<Record<string, string>> {
  assert.equal(res.status, 200);
  const body = await res.json();
  screensSchemas.setDisplayNameResponseSchema.parse(body);
  return (body as Pick<MeBody, "user">).user.answers;
}

/** What the connections game does to each person when it makes their connection. */
const connect = (userId: string) => testDb().transaction((tx) => game.fixAnswers(tx, userId));

test("/me gives the questions, and no answers before any", async () => {
  const { meAs, userId } = await harness();
  const me = await meAs(userId);
  assert.deepEqual(me.questions, QUESTIONS);
  assert.deepEqual(me.user.answers, {});
});

test("a participant answers some questions, then the rest, and /me shows each answered one", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const cookie = await signIn(userId);
  assert.deepEqual(await answersIn(await patchMe({ answers: { drink: "tea" } }, cookie)), {
    drink: "tea",
  });
  assert.deepEqual((await meAs(userId)).user.answers, { drink: "tea" });

  const rest = await patchMe({ answers: { superpower: "minds", hours: "owl" } }, cookie);
  const all = { drink: "tea", superpower: "minds", hours: "owl" };
  assert.deepEqual(await answersIn(rest), all);
  assert.deepEqual((await meAs(userId)).user.answers, all);
});

test("a participant changes an answer, and keeps the others", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const cookie = await signIn(userId);
  await answersIn(await patchMe({ answers: { drink: "tea", hours: "owl" } }, cookie));
  await answersIn(await patchMe({ answers: { drink: "coffee" } }, cookie));
  assert.deepEqual((await meAs(userId)).user.answers, { drink: "coffee", hours: "owl" });
});

test("an unknown question or choice is refused under its question, and nothing changes", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const cookie = await signIn(userId);
  await answersIn(await patchMe({ answers: { drink: "tea" } }, cookie));

  const refused: [unknown, (string | number)[][]][] = [
    [{ answers: { snack: "chips" } }, [["answers", "snack"]]],
    [{ answers: { drink: "milo" } }, [["answers", "drink"]]],
    [{ answers: { drink: "coffee", hours: "noon" } }, [["answers", "hours"]]],
    [{ answers: { drink: 7 } }, [["answers", "drink"]]],
    [{ answers: "tea" }, [["answers"]]],
    [{ display_name: "Sam", answers: { drink: "milo" } }, [["answers", "drink"]]],
  ];
  for (const [body, paths] of refused) {
    assert.deepEqual(await issuePaths(await patchMe(body, cookie)), paths, JSON.stringify(body));
  }
  const { user } = await meAs(userId);
  assert.deepEqual(user.answers, { drink: "tea" });
  assert.equal(user.display_name, "Alex");
});

test("one request sets the name and answers together", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const res = await patchMe(
    { display_name: "Ally", answers: { drink: "tea" } },
    await signIn(userId),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  screensSchemas.setDisplayNameResponseSchema.parse(body);
  assert.deepEqual(body, {
    user: {
      id: userId,
      display_name: "Ally",
      role: "participant",
      has_name: true,
      kind: null,
      answers: { drink: "tea" },
    },
  });
  const { user } = await meAs(userId);
  assert.equal(user.display_name, "Ally");
  assert.deepEqual(user.answers, { drink: "tea" });
});

test("after a connection the answers are fixed, and a change is refused with nothing changed", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const cookie = await signIn(userId);
  await answersIn(await patchMe({ answers: { drink: "tea" } }, cookie));
  assert.deepEqual(await connect(userId), { drink: "tea" });

  for (const body of [
    { answers: { drink: "coffee" } },
    { answers: { hours: "owl" } },
    { display_name: "Sam", answers: { hours: "owl" } },
  ]) {
    const res = await patchMe(body, cookie);
    assert.equal(res.status, 409, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error: "answers_fixed" });
  }
  const { user } = await meAs(userId);
  assert.deepEqual(user.answers, { drink: "tea" });
  assert.equal(user.display_name, "Alex");
  // The name can still change.
  assert.equal((await patchMe({ display_name: "Sam" }, cookie)).status, 200);
  // A second connection gives the same answers.
  assert.deepEqual(await connect(userId), { drink: "tea" });
});

test("a participant who connects before answering can't answer after", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  assert.deepEqual(await connect(userId), {});
  const res = await patchMe({ answers: { drink: "tea" } }, await signIn(userId));
  assert.equal(res.status, 409);
  assert.deepEqual((await meAs(userId)).user.answers, {});
});

test("answers sent at once, one question each, are all kept", async () => {
  const { signIn, patchMe, meAs, userId } = await harness();
  const cookie = await signIn(userId);
  const all = { drink: "coffee", superpower: "fly", hours: "bird" };
  await Promise.all(
    Object.entries(all).map(async ([question, choice]) =>
      answersIn(await patchMe({ answers: { [question]: choice } }, cookie)),
    ),
  );
  assert.deepEqual((await meAs(userId)).user.answers, all);
});

test("an answer to a question or choice the event dropped no longer shows", async () => {
  const { signIn, patchMe, userId } = await harness();
  const all = { drink: "coffee", superpower: "fly", hours: "bird" };
  await answersIn(await patchMe({ answers: all }, await signIn(userId)));

  // A later deploy drops the superpower question and the early bird, and rewords coffee.
  const [drink, , hours] = QUESTIONS;
  const changed: Question[] = [
    {
      ...drink!,
      choices: [
        { id: "tea", text: "Tea" },
        { id: "coffee", text: "Kopi" },
      ],
    },
    { ...hours!, choices: [{ id: "owl", text: "Night owl" }] },
  ];
  const me = await clientOf(testApp({}, { answers: answersGame(changed) })).meAs(userId);
  assert.deepEqual(me.questions, changed);
  assert.deepEqual(me.user.answers, { drink: "coffee" });
});
