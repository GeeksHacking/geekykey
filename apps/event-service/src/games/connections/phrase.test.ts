import assert from "node:assert/strict";
import { test } from "vitest";
import { users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { connectionsGame } from "./connections.ts";

// Each participant holds one word of a phrase, and connections complete it (BAC-169, agreement 0.14).
// An organizer types the phrase on the Groups screen. Everyone
// placed in a group holds one of its words, and has their own plus the word of each person they
// have a connection with. /me shows the phrase with a blank for each word still to find.

const ORGANIZER = "dev-organizer-1";

const { groupBoardResponseSchema, eventGroupSchema, meResponseSchema } = screensSchemas;

/** Nine participants, three to a group in most tests. */
const PEOPLE = ["ann", "ben", "cat", "dan", "eve", "fay", "gus", "hal", "ivy"] as const;

/** Four more, for a test with bigger groups. */
const MORE_PEOPLE = ["jon", "kim", "lee", "max"] as const;

type Person = (typeof PEOPLE | typeof MORE_PEOPLE)[number];

/** GET /api/v1/me, as far as these tests read it. */
interface MeBody {
  phrase?: { words: (string | null)[]; your_word: number };
  connections: { display_name: string; word?: { text: string; already_had: boolean } | null }[];
}

/** GET /api/v1/admin/groups, as far as these tests read it. */
interface BoardBody {
  phrase: { text: string; completed_count: number } | null;
  groups: { id: string; name: string; members: { user_id: string }[] }[];
}

/** The Event Service with a connections game, no answers game, and an Allocate that doesn't shuffle. */
async function harness() {
  const clock = fakeClock("2026-11-13T09:00:00.000Z");
  const app = testApp(
    {},
    {
      now: clock.now,
      shuffle: (items) => [...items],
      connections: connectionsGame(null, { rollDie: () => 4, pickGame: () => "dice" }),
    },
  );
  await testDb()
    .insert(users)
    .values([ORGANIZER, ...PEOPLE, ...MORE_PEOPLE].map((id) => ({ id, displayName: id })));

  /** Sends a request as `userId`, signed in through dev-login. */
  const send = async (
    userId: string,
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ) => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return app.request(path, {
      method,
      headers: {
        Cookie: login.headers.get("set-cookie")!.split(";")[0]!,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };

  /** Creates a group and gives its ID. */
  const createGroup = async (name: string) => {
    const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name });
    assert.equal(response.status, 201);
    const body: unknown = await response.json();
    eventGroupSchema.parse(body);
    return (body as { id: string }).id;
  };

  /** Puts `userId` in the group `groupId`, joining them if they haven't, or waiting with null. */
  const place = async (userId: Person, groupId: string | null) => {
    const response = await send(ORGANIZER, "PUT", `/api/v1/admin/groups/members/${userId}`, {
      group_id: groupId,
    });
    assert.equal(response.status, 200);
  };

  /**
   * Makes a group for each name, in order, with the people given for it, and gives their IDs.
   * Each person is placed a second after the one before, so words are dealt in this order.
   */
  const makeGroups = async (groups: Record<string, readonly Person[]>) => {
    const ids: Record<string, string> = {};
    for (const [name, people] of Object.entries(groups)) {
      ids[name] = await createGroup(name);
      for (const person of people) {
        clock.advanceSeconds(1);
        await place(person, ids[name]);
      }
    }
    return ids;
  };

  /** The organizers' board, which the Groups screen must accept. */
  const boardFrom = async (response: Response) => {
    const body: unknown = await response.json();
    groupBoardResponseSchema.parse(body);
    return body as BoardBody;
  };

  const board = async () => {
    const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups");
    assert.equal(response.status, 200);
    return boardFrom(response);
  };

  /** Sets the phrase as the Groups screen does, and gives the board it answers with. */
  const setPhrase = async (phrase: string | null) => {
    const response = await send(ORGANIZER, "PUT", "/api/v1/admin/groups/phrase", { phrase });
    assert.equal(response.status, 200);
    return boardFrom(response);
  };

  /** One half: `userId` tapped the token of `ownerId`, as the GeekyKey Service hands it on. */
  const meet = async (userId: Person, ownerId: Person) => {
    const response = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, user_kind: "A", owner_id: ownerId, owner_kind: "B" }),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { status: string }).status;
  };

  /** Both halves, so the two are connected: a tap back accepts the request. */
  const connect = async (one: Person, other: Person) => {
    assert.equal(await meet(one, other), "waiting");
    clock.advanceSeconds(10);
    assert.equal(await meet(other, one), "connected");
    clock.advanceSeconds(10);
  };

  /** /me, which the Event screens must accept. */
  const me = async (userId: string) => {
    const response = await send(userId, "GET", "/api/v1/me");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    meResponseSchema.parse(body);
    return body as MeBody;
  };

  /** The phrase as `userId` sees it, with `_` for each blank, or null when they see none. */
  const phraseOf = async (userId: string) => {
    const { phrase } = await me(userId);
    return phrase ? phrase.words.map((word) => word ?? "_").join(" ") : null;
  };

  /** The word `userId` holds, or null for none. */
  const wordOf = async (userId: string) => {
    const { phrase } = await me(userId);
    return phrase ? phrase.words[phrase.your_word] : null;
  };

  /** Each person's own word, by their name. */
  const wordsOf = async (people: readonly Person[]) => {
    const words: Record<string, string | null | undefined> = {};
    for (const person of people) words[person] = await wordOf(person);
    return words;
  };

  /** The word each of `userId`'s connections gave, newest first, as the list shows them. */
  const connectionWords = async (userId: string) =>
    (await me(userId)).connections.map(({ display_name, word }) => ({ with: display_name, word }));

  return {
    clock,
    send,
    createGroup,
    place,
    makeGroups,
    board,
    setPhrase,
    connect,
    me,
    phraseOf,
    wordOf,
    wordsOf,
    connectionWords,
  };
}

const THREE_GROUPS = {
  Red: ["ann", "ben", "cat"],
  Blue: ["dan", "eve", "fay"],
  Green: ["gus", "hal", "ivy"],
} as const;

const FOUR_WORDS = "Strangers become friends today";

test("with a phrase set, everyone in a group holds one word, spread evenly, and no group holds them all", async () => {
  const { makeGroups, setPhrase, wordsOf, phraseOf } = await harness();
  await makeGroups(THREE_GROUPS);
  await setPhrase(FOUR_WORDS);

  // Nine people and four words: one word has three holders and the rest two. Each group has
  // three different words, and each misses a different one.
  assert.deepEqual(await wordsOf(PEOPLE), {
    ann: "Strangers",
    ben: "become",
    cat: "friends",
    dan: "today",
    eve: "Strangers",
    fay: "become",
    gus: "friends",
    hal: "today",
    ivy: "Strangers",
  });
  // Before any connection, a participant sees their own word and a blank for each other.
  assert.equal(await phraseOf("ben"), "_ become _ _");
});

test("each group is left without a different word, so every word can come from another group", async () => {
  const { makeGroups, setPhrase, wordsOf } = await harness();
  const groups = {
    Red: ["ann", "ben", "cat"],
    Blue: ["dan", "eve", "fay", "gus"],
    Green: ["hal", "ivy", "jon", "kim", "lee", "max"],
  } as const;
  await setPhrase(FOUR_WORDS);
  await makeGroups(groups);

  // Red has no "today", Blue no "friends" and Green no "become". Had two groups lacked the same
  // word, only the third would hold it, and its members couldn't give it to each other while
  // connections go across groups.
  assert.deepEqual(await wordsOf(groups.Red), {
    ann: "Strangers",
    ben: "become",
    cat: "friends",
  });
  assert.deepEqual(await wordsOf(groups.Blue), {
    dan: "today",
    eve: "Strangers",
    fay: "become",
    gus: "today",
  });
  assert.deepEqual(await wordsOf(groups.Green), {
    hal: "friends",
    ivy: "today",
    jon: "Strangers",
    kim: "friends",
    lee: "today",
    max: "Strangers",
  });
});

test("a phrase set before the groups deals a word at placement, and a latecomer gets the word their group has fewest of", async () => {
  const { clock, send, createGroup, setPhrase, wordsOf } = await harness();
  await setPhrase("Meet someone new");
  await createGroup("Red");
  await createGroup("Blue");
  const join = async (person: Person) => {
    clock.advanceSeconds(1);
    assert.equal((await send(person, "POST", "/api/v1/me/group")).status, 200);
  };
  for (const person of ["ann", "ben", "cat", "dan", "eve", "fay"] as const) await join(person);
  assert.deepEqual(await wordsOf(["ann", "fay"]), { ann: null, fay: null });

  // Allocate puts them in Red and Blue in turn. Red never gets "someone" and Blue never "new".
  assert.equal((await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate")).status, 200);
  assert.deepEqual(await wordsOf(["ann", "cat", "eve"]), { ann: "Meet", cat: "new", eve: "new" });
  assert.deepEqual(await wordsOf(["ben", "dan", "fay"]), {
    ben: "someone",
    dan: "Meet",
    fay: "someone",
  });

  // Gus arrives late and goes to Red, which has one "Meet" and two "new". Hal goes to Blue,
  // which has one "Meet" and two "someone".
  await join("gus");
  await join("hal");
  assert.deepEqual(await wordsOf(["gus", "hal"]), { gus: "Meet", hal: "Meet" });
});

test("a connection gives each person the other's word at once, and says when they had it already", async () => {
  const { makeGroups, setPhrase, connect, phraseOf, connectionWords, board } = await harness();
  await makeGroups(THREE_GROUPS);
  await setPhrase(FOUR_WORDS);

  await connect("ann", "dan");
  assert.equal(await phraseOf("ann"), "Strangers _ _ today");
  assert.equal(await phraseOf("dan"), "Strangers _ _ today");
  assert.deepEqual(await connectionWords("ann"), [
    { with: "dan", word: { text: "today", already_had: false } },
  ]);

  // Hal holds "today" too, and Eve holds Ann's own word.
  await connect("ann", "hal");
  await connect("ann", "eve");
  assert.equal(await phraseOf("ann"), "Strangers _ _ today");
  assert.deepEqual(await connectionWords("ann"), [
    { with: "eve", word: { text: "Strangers", already_had: true } },
    { with: "hal", word: { text: "today", already_had: true } },
    { with: "dan", word: { text: "today", already_had: false } },
  ]);
  assert.equal((await board()).phrase?.completed_count, 0);

  // With every word, the phrase is whole, and the board counts her.
  await connect("ann", "fay");
  await connect("ann", "gus");
  assert.equal(await phraseOf("ann"), FOUR_WORDS);
  assert.equal(await phraseOf("gus"), "Strangers _ friends _");
  assert.deepEqual(await board().then(({ phrase }) => phrase), {
    text: FOUR_WORDS,
    completed_count: 1,
  });
});

test("an organizer sets the phrase, changes it, which deals every word again, and empties it", async () => {
  const { makeGroups, setPhrase, connect, wordsOf, phraseOf, me, board } = await harness();
  await makeGroups(THREE_GROUPS);
  // A new event has no phrase, and /me says nothing of one.
  assert.equal((await board()).phrase, null);
  assert.equal("phrase" in (await me("ann")), false);

  // Spaces and line breaks only separate the words.
  const set = await setPhrase("  Strangers   become\nfriends today ");
  assert.deepEqual(set.phrase, { text: FOUR_WORDS, completed_count: 0 });
  await connect("ann", "dan");
  assert.equal(await phraseOf("ann"), "Strangers _ _ today");

  // The same phrase again leaves everyone's word alone.
  await setPhrase(FOUR_WORDS);
  assert.equal(await phraseOf("ann"), "Strangers _ _ today");

  // With two words, each group holds one of them, so finishing takes another group.
  await setPhrase("Hello there");
  assert.deepEqual(await wordsOf(PEOPLE), {
    ann: "Hello",
    ben: "Hello",
    cat: "Hello",
    dan: "there",
    eve: "there",
    fay: "there",
    gus: "Hello",
    hal: "Hello",
    ivy: "Hello",
  });
  // Ann's connection with Dan is still there, so it completes the new phrase for both.
  assert.equal(await phraseOf("ann"), "Hello there");
  assert.equal((await board()).phrase?.completed_count, 2);

  // Emptied, by null or by blank text, it goes from every phone, and /me is as it was before.
  for (const empty of [null, "   "]) {
    assert.equal((await setPhrase(empty)).phrase, null);
    const body = await me("ann");
    assert.equal("phrase" in body, false);
    assert.equal("word" in body.connections[0]!, false);
  }
});

test("a phrase needs 2 to 12 words of at most 20 characters each", async () => {
  const { send, setPhrase, board } = await harness();
  const refused = async (phrase: unknown) => {
    const response = await send(ORGANIZER, "PUT", "/api/v1/admin/groups/phrase", { phrase });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { error: string }).error, "validation_failed");
  };
  await refused("Hello");
  await refused("a b c d e f g h i j k l m");
  await refused(`Hello ${"x".repeat(21)}`);
  await refused(7);
  assert.equal((await board()).phrase, null);

  const twelve = "a b c d e f g h i j k l";
  assert.equal((await setPhrase(twelve)).phrase?.text, twelve);
  // Twenty emoji are twenty characters.
  const longest = `Hello ${"🎉".repeat(20)}`;
  assert.equal((await setPhrase(longest)).phrase?.text, longest);
});

test("only an organizer sets the phrase", async () => {
  const { send } = await harness();
  const response = await send("ann", "PUT", "/api/v1/admin/groups/phrase", { phrase: "Hi there" });
  assert.equal(response.status, 403);
});

test("someone keeps their word when they move group, and what they gave stays given while they wait", async () => {
  const { makeGroups, setPhrase, place, connect, wordOf, phraseOf, connectionWords } =
    await harness();
  const ids = await makeGroups(THREE_GROUPS);
  await setPhrase(FOUR_WORDS);
  await connect("ann", "dan");

  await place("dan", ids.Green!);
  assert.equal(await wordOf("dan"), "today");

  // Waiting, Dan sees no phrase, and Ann keeps the word he gave her.
  await place("dan", null);
  assert.equal(await phraseOf("dan"), null);
  assert.equal("word" in (await connectionWords("dan"))[0]!, true);
  assert.equal((await connectionWords("dan"))[0]!.word, undefined);
  assert.equal(await phraseOf("ann"), "Strangers _ _ today");

  // Back in a group, he has the word he had.
  await place("dan", ids.Red!);
  assert.equal(await phraseOf("dan"), "Strangers _ _ today");
});

test("someone not in a group holds no word and sees no phrase, and neither does an organizer", async () => {
  const { makeGroups, setPhrase, place, connect, phraseOf, connectionWords, board } =
    await harness();
  await makeGroups({ Red: ["ann", "ben"], Blue: ["dan", "eve"] });
  // Ivy waits, and Hal hasn't joined.
  await place("ivy", null);
  await setPhrase("Hello there");
  await connect("ann", "ivy");
  await connect("ann", "hal");

  assert.equal(await phraseOf("ivy"), null);
  assert.equal(await phraseOf("hal"), null);
  assert.equal(await phraseOf(ORGANIZER), null);
  // A connection with someone who holds no word gives none.
  assert.equal(await phraseOf("ann"), "Hello _");
  assert.deepEqual(await connectionWords("ann"), [
    { with: "hal", word: null },
    { with: "ivy", word: null },
  ]);
  assert.equal((await board()).phrase?.completed_count, 0);
});

test("the groups' Reset takes every word back, and the next placement deals again", async () => {
  const { send, makeGroups, setPhrase, place, wordsOf, phraseOf, board } = await harness();
  const ids = await makeGroups(THREE_GROUPS);
  await setPhrase(FOUR_WORDS);

  assert.equal((await send(ORGANIZER, "POST", "/api/v1/admin/groups/reset")).status, 200);
  assert.equal(await phraseOf("ann"), null);
  // The phrase itself stays set.
  assert.equal((await board()).phrase?.text, FOUR_WORDS);

  // Dan is placed first this time, so he gets the first word, which Ann had.
  await place("dan", ids.Red!);
  await place("ann", ids.Red!);
  assert.deepEqual(await wordsOf(["dan", "ann"]), { dan: "Strangers", ann: "become" });
});

test("with one group, its members hold every word, since there's no other group to finish with", async () => {
  const { makeGroups, setPhrase, wordsOf } = await harness();
  await makeGroups({ Red: ["ann", "ben", "cat"] });
  await setPhrase("Hello there");
  assert.deepEqual(await wordsOf(["ann", "ben", "cat"]), {
    ann: "Hello",
    ben: "there",
    cat: "Hello",
  });
});

test("connecting across groups, each of two groups holds every word, so everyone can finish", async () => {
  const { send, makeGroups, setPhrase, wordsOf } = await harness();
  const rule = await send(ORGANIZER, "PUT", "/api/v1/admin/connections/rule", {
    connect_across: "groups",
  });
  assert.equal(rule.status, 200);
  await makeGroups({ Red: ["ann", "ben", "cat"], Blue: ["dan", "eve", "fay"] });
  await setPhrase("Meet someone new");

  // Nobody connects inside their own group, so a word kept back from Blue would be one that
  // Red's members could never get.
  assert.deepEqual(await wordsOf(["ann", "ben", "cat", "dan", "eve", "fay"]), {
    ann: "Meet",
    ben: "someone",
    cat: "new",
    dan: "Meet",
    eve: "someone",
    fay: "new",
  });
});
