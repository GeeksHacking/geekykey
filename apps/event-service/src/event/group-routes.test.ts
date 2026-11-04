import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { anotherTestDb, fakeClock, screensSchemas, testApp, testDb } from "../test-helpers.ts";
import type { Shuffle } from "./groups.ts";
import { groupMembers, participantGroups, users } from "./schema.ts";

const ORGANIZER = "dev-organizer-1";
const JOINED_AT = "2026-11-05T01:00:00.000Z";

const { myGroupResponseSchema, groupBoardResponseSchema, eventGroupSchema } = screensSchemas;

/** GET and POST /api/v1/me/group, in the shape the spec's draft for agreement 0.14 gives. */
interface MyGroupBody {
  status: "not_joined" | "waiting" | "placed";
  allocation_started: boolean;
  group: {
    id: string;
    name: string;
    tags: string[];
    location: string | null;
    members: { display_name: string }[];
  } | null;
}

/** GET /api/v1/admin/groups and POST /api/v1/admin/groups/allocate, from the same draft. */
interface BoardBody {
  allocation_started_at: string | null;
  joined_count: number;
  groups: {
    id: string;
    name: string;
    tags: string[];
    location: string | null;
    capacity: number | null;
    members: {
      user_id: string;
      display_name: string;
      joined_at: string;
      placed_at: string;
      how: string;
    }[];
  }[];
  waiting: { user_id: string; display_name: string; joined_at: string }[];
}

/** The people these tests sign in, with their names. */
const PEOPLE = [
  { id: ORGANIZER, displayName: "Olive" },
  { id: "user-1", displayName: "Alex" },
  { id: "user-2", displayName: "Bala" },
  { id: "user-3", displayName: "Chen" },
  { id: "user-4", displayName: "Dewi" },
];

/** A second instance of the service, with its own connections, made once for the file. */
let secondInstanceDb: ReturnType<typeof anotherTestDb> | undefined;

/**
 * Every test goes through the routes a screen calls, and reads answers as the
 * screens do. `instances` above 1 runs more of the service against the same
 * database, as Cloud Run may, and `join` takes which one to send to.
 */
async function harness({ shuffle, instances = 1 }: { shuffle?: Shuffle; instances?: 1 | 2 } = {}) {
  const clock = fakeClock(JOINED_AT);
  const app = testApp({}, { now: clock.now, shuffle });
  const apps = [app];
  if (instances === 2) {
    secondInstanceDb ??= anotherTestDb();
    apps.push(testApp({}, { now: clock.now, shuffle, db: secondInstanceDb }));
  }
  // Dev-login signs in only someone who has logged in to this event before.
  await testDb().insert(users).values(PEOPLE);

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string, on = app): Promise<string> => {
    const login = await on.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return login.headers.get("set-cookie")!.split(";")[0]!;
  };

  /** Sends a request as `userId`, or with no session when it's null, to the first instance unless told. */
  const send = async (
    userId: string | null,
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    instance = 0,
  ) =>
    apps[instance]!.request(path, {
      method,
      headers: {
        ...(userId === null ? {} : { Cookie: await signIn(userId, apps[instance]) }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  /** Reads and checks an answer as the screens' `schema` does, as the given `Body`. */
  const read = async <Body>(
    response: Response,
    schema: { parse(input: unknown): unknown },
    status = 200,
  ) => {
    assert.equal(response.status, status);
    const json: unknown = await response.json();
    schema.parse(json);
    return json as Body;
  };

  /** Creates a group, with room for any number unless given a `capacity`. */
  const createGroup = async (name: string, capacity?: number) =>
    read<BoardBody["groups"][number]>(
      await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name, capacity }),
      eventGroupSchema,
      201,
    );

  const board = async () =>
    read<BoardBody>(await send(ORGANIZER, "GET", "/api/v1/admin/groups"), groupBoardResponseSchema);

  const myGroup = async (userId: string) =>
    read<MyGroupBody>(await send(userId, "GET", "/api/v1/me/group"), myGroupResponseSchema);

  const join = async (userId: string, instance = 0) =>
    read<MyGroupBody>(
      await send(userId, "POST", "/api/v1/me/group", undefined, instance),
      myGroupResponseSchema,
    );

  const allocate = async () =>
    read<BoardBody>(
      await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate"),
      groupBoardResponseSchema,
    );

  let crowdSize = 0;
  /** Adds `count` more people who have logged in to the event before, and gives their user IDs. */
  const arriveCrowd = async (count: number): Promise<string[]> => {
    const crowd = Array.from({ length: count }, (_, i) => {
      const n = String(crowdSize + i + 1).padStart(2, "0");
      return { id: `crowd-${n}`, displayName: `Person ${n}` };
    });
    crowdSize += count;
    await testDb().insert(users).values(crowd);
    return crowd.map(({ id }) => id);
  };

  /** Joins `count` more people, one after another, and gives their user IDs. */
  const joinCrowd = async (count: number): Promise<string[]> => {
    const crowd = await arriveCrowd(count);
    for (const id of crowd) await join(id);
    return crowd;
  };

  return {
    clock,
    send,
    read,
    createGroup,
    board,
    myGroup,
    join,
    arriveCrowd,
    joinCrowd,
    allocate,
  };
}

test("a new group is on the board by its name, with nobody in it", async () => {
  const { createGroup, board } = await harness();

  const group = await createGroup("  Mixer A  ");

  assert.deepEqual(group, {
    id: group.id,
    name: "Mixer A",
    tags: [],
    location: null,
    capacity: null,
    members: [],
  });
  assert.deepEqual(await board(), {
    allocation_started_at: null,
    joined_count: 0,
    groups: [group],
    waiting: [],
  });
});

test("a second group with the same name gets 409 name_taken, and isn't made", async () => {
  const { send, createGroup, board } = await harness();
  await createGroup("Mixer A");

  const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name: "Mixer A" });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "name_taken" });
  assert.equal((await board()).groups.length, 1);
});

test("a name that differs only in capitals is the same name", async () => {
  const { send, createGroup, board } = await harness();
  await createGroup("Mixer A");

  const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name: "MIXER a" });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "name_taken" });
  assert.equal((await board()).groups.length, 1);
});

test("two names that differ only in their emoji are different names", async () => {
  const { createGroup, board } = await harness();

  await createGroup("Mixer 😀");
  await createGroup("Mixer 😁");

  assert.equal((await board()).groups.length, 2);
});

test("two creates at once with the same name make one group", async () => {
  const { send, board } = await harness();

  const answers = await Promise.all(
    ["Mixer A", "mixer a"].map((name) => send(ORGANIZER, "POST", "/api/v1/admin/groups", { name })),
  );

  assert.deepEqual(answers.map(({ status }) => status).sort(), [201, 409]);
  assert.equal((await board()).groups.length, 1);
});

test("a group's name must be 1 to 80 characters", async () => {
  const { send, createGroup } = await harness();

  for (const name of ["   ", "x".repeat(81)]) {
    const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name });
    assert.equal(response.status, 400);
    const { error, issues } = (await response.json()) as {
      error: string;
      issues: { path: string[] }[];
    };
    assert.equal(error, "validation_failed");
    assert.deepEqual(issues[0]!.path, ["name"]);
  }
  // Counted in code points, as the agreement's organizer text is: each emoji is one.
  assert.equal((await createGroup("😀".repeat(80))).name, "😀".repeat(80));
});

test("a group can have a capacity, and has none unless given one", async () => {
  const { clock, send, read, createGroup, board } = await harness();

  const small = await createGroup("Small room", 6);
  clock.advanceSeconds(1);
  const hall = await createGroup("Hall");
  clock.advanceSeconds(1);
  const stage = await send(ORGANIZER, "POST", "/api/v1/admin/groups", {
    name: "Stage",
    capacity: null,
  });

  assert.equal(small.capacity, 6);
  assert.equal(hall.capacity, null);
  assert.equal(
    (await read<BoardBody["groups"][number]>(stage, eventGroupSchema, 201)).capacity,
    null,
  );
  assert.deepEqual(
    (await board()).groups.map((group) => group.capacity),
    [6, null, null],
  );
});

test("a capacity must be a whole number above 0", async () => {
  const { send, board } = await harness();

  for (const capacity of [0, -1, 2.5, "4"]) {
    const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups", {
      name: "Small room",
      capacity,
    });
    assert.equal(response.status, 400, `capacity ${String(capacity)}`);
    const { error, issues } = (await response.json()) as {
      error: string;
      issues: { path: string[] }[];
    };
    assert.equal(error, "validation_failed");
    assert.deepEqual(issues[0]!.path, ["capacity"]);
  }
  assert.deepEqual((await board()).groups, []);
});

test("groups are listed oldest first", async () => {
  const { clock, createGroup, board } = await harness();

  await createGroup("Zebra");
  clock.advanceSeconds(1);
  await createGroup("Apple");

  assert.deepEqual(
    (await board()).groups.map((group) => group.name),
    ["Zebra", "Apple"],
  );
});

test("someone who hasn't joined is not_joined, an organizer included", async () => {
  const { myGroup } = await harness();

  const notJoined = { status: "not_joined", allocation_started: false, group: null };
  assert.deepEqual(await myGroup("user-1"), notJoined);
  assert.deepEqual(await myGroup(ORGANIZER), notJoined);
});

test("a participant who joins waits, and the board shows them waiting", async () => {
  const { join, myGroup, board } = await harness();

  const waiting = { status: "waiting", allocation_started: false, group: null };
  assert.deepEqual(await join("user-1"), waiting);
  assert.deepEqual(await myGroup("user-1"), waiting);

  const { joined_count, waiting: list } = await board();
  assert.equal(joined_count, 1);
  assert.deepEqual(list, [{ user_id: "user-1", display_name: "Alex", joined_at: JOINED_AT }]);
});

test("joining twice changes nothing", async () => {
  const { clock, join, board } = await harness();
  await join("user-1");
  clock.advanceSeconds(60);

  assert.equal((await join("user-1")).status, "waiting");

  const { joined_count, waiting } = await board();
  assert.equal(joined_count, 1);
  assert.equal(waiting[0]!.joined_at, JOINED_AT);
});

test("joining again after being placed keeps the place", async () => {
  const { createGroup, join, allocate } = await harness();
  const group = await createGroup("Mixer A");
  await join("user-1");
  await join("user-2");
  await allocate();

  const again = await join("user-1");

  assert.equal(again.status, "placed");
  assert.equal(again.group!.id, group.id);
});

test("an organizer account is refused when joining, and doesn't join", async () => {
  const { send, board } = await harness();

  const response = await send(ORGANIZER, "POST", "/api/v1/me/group");

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal((await board()).joined_count, 0);
});

/** Every organizer route this ticket adds. */
const ORGANIZER_ROUTES = [
  ["GET", "/api/v1/admin/groups"],
  ["POST", "/api/v1/admin/groups"],
  ["POST", "/api/v1/admin/groups/allocate"],
] as const;

test("a participant is refused on every organizer route", async () => {
  const { send, board } = await harness();

  for (const [method, path] of ORGANIZER_ROUTES) {
    const response = await send(
      "user-1",
      method,
      path,
      method === "POST" ? { name: "Mine" } : undefined,
    );
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: "forbidden" });
  }
  assert.deepEqual((await board()).groups, []);
});

test("nobody signed in is refused on every route", async () => {
  const { send } = await harness();

  for (const [method, path] of [
    ...ORGANIZER_ROUTES,
    ["GET", "/api/v1/me/group"],
    ["POST", "/api/v1/me/group"],
  ] as const) {
    const response = await send(null, method, path);
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: "unauthenticated" });
  }
});

test("after Allocate, each joined participant is in exactly one group", async () => {
  const { clock, createGroup, join, allocate, myGroup } = await harness();
  const groups = [await createGroup("Mixer A"), await createGroup("Mixer B")];
  const everyone = ["user-1", "user-2", "user-3", "user-4"];
  for (const userId of everyone) await join(userId);
  clock.advanceSeconds(90);
  const placedAt = clock.now().toISOString();

  const board = await allocate();

  assert.equal(board.allocation_started_at, placedAt);
  assert.equal(board.joined_count, 4);
  assert.deepEqual(board.waiting, []);
  const placed = board.groups.flatMap((group) => group.members);
  assert.deepEqual(placed.map((member) => member.user_id).sort(), everyone);
  for (const member of placed) {
    assert.equal(member.placed_at, placedAt);
    assert.equal(member.how, "allocated");
    assert.equal(member.joined_at, JOINED_AT);
  }
  // What each participant then reads agrees with the board.
  for (const userId of everyone) {
    const mine = await myGroup(userId);
    assert.equal(mine.status, "placed");
    assert.equal(mine.allocation_started, true);
    const onBoard = board.groups.find((group) =>
      group.members.some((member) => member.user_id === userId),
    );
    assert.equal(mine.group!.id, onBoard!.id);
    assert.ok(groups.some((group) => group.id === mine.group!.id));
  }
});

test("a participant's answer shows only their own group's names, with no user IDs", async () => {
  const { createGroup, join, allocate, send } = await harness();
  await createGroup("Mixer A");
  await createGroup("Mixer B");
  for (const userId of ["user-1", "user-2", "user-3", "user-4"]) await join(userId);
  const board = await allocate();

  for (const group of board.groups) {
    for (const member of group.members) {
      const response = await send(member.user_id, "GET", "/api/v1/me/group");
      const text = await response.text();
      const mine = JSON.parse(text) as MyGroupBody;

      assert.equal(mine.group!.name, group.name);
      assert.deepEqual(
        mine.group!.members.map(({ display_name }) => display_name).sort(),
        group.members.map(({ display_name }) => display_name).sort(),
      );
      // Each member is only a name, and no other field carries anyone's ID.
      assert.deepEqual(Object.keys(mine.group!.members[0]!), ["display_name"]);
      assert.equal(text.includes("user-"), false);
    }
  }
});

test("a new name shows to the rest of the group at their next read", async () => {
  const { createGroup, join, allocate, send, myGroup } = await harness();
  await createGroup("Mixer A");
  await join("user-1");
  await join("user-2");
  await allocate();

  const named = await send("user-1", "PATCH", "/api/v1/me", { display_name: "Ally" });
  assert.equal(named.status, 200);

  const names = (await myGroup("user-2")).group!.members.map((member) => member.display_name);
  assert.deepEqual(names.sort(), ["Ally", "Bala"]);
});

/**
 * Deletes a group and sends its members back to waiting, as the spec says its
 * delete route will. That route is BAC-132's, so until it's built, this does
 * it straight in the tables.
 */
async function deleteGroup(groupId: string) {
  await testDb()
    .update(groupMembers)
    .set({ groupId: null, placedAt: null, how: null })
    .where(eq(groupMembers.groupId, groupId));
  await testDb().delete(participantGroups).where(eq(participantGroups.id, groupId));
}

test("pressing Allocate again places a deleted group's members, and moves nobody else", async () => {
  const { clock, createGroup, joinCrowd, allocate, board } = await harness();
  const doomed = await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  clock.advanceSeconds(1);
  await createGroup("Mixer C");
  await joinCrowd(6);
  await allocate();
  await deleteGroup(doomed.id);
  const before = await board();
  assert.equal(before.waiting.length, 2);
  clock.advanceSeconds(30);

  const after = await allocate();

  assert.equal(after.allocation_started_at, before.allocation_started_at);
  assert.deepEqual(after.waiting, []);
  assert.deepEqual(sizes(after), [3, 3]);
  for (const group of before.groups) {
    const now = after.groups.find(({ id }) => id === group.id)!;
    for (const member of group.members)
      assert.ok(
        now.members.some((m) => m.user_id === member.user_id && m.placed_at === member.placed_at),
      );
  }
});

test("Allocate places the waiting list in the order the shuffle gives, not the order they joined", async () => {
  // The last to join is placed first, so arriving together doesn't keep friends together.
  const { clock, createGroup, joinCrowd, allocate } = await harness({
    shuffle: (items) => [...items].reverse(),
  });
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  await joinCrowd(4);

  const board = await allocate();

  assert.deepEqual(
    board.groups.map((group) => group.members.map((member) => member.user_id).sort()),
    [
      ["crowd-02", "crowd-04"],
      ["crowd-01", "crowd-03"],
    ],
  );
});

/** How many are in each group on `board`, oldest group first. */
const sizes = (board: BoardBody) => board.groups.map((group) => group.members.length);

/** The brief's scenarios, from the spec's "Testing decisions": people, capacities, then sizes. */
const SCENARIOS = [
  {
    name: "12 people in 3 groups gives 4, 4, 4",
    people: 12,
    capacities: [null, null, null],
    sizes: [4, 4, 4],
  },
  {
    name: "13 people in 3 groups gives 5, 4, 4",
    people: 13,
    capacities: [null, null, null],
    sizes: [5, 4, 4],
  },
  {
    name: "8 people with capacities 2 and 6 gives 2 and 6",
    people: 8,
    capacities: [2, 6],
    sizes: [2, 6],
  },
  {
    name: "8 people with capacities 3 and 3 gives 4 and 4",
    people: 8,
    capacities: [3, 3],
    sizes: [4, 4],
  },
  {
    name: "9 people with capacities 2 and 4, and one group with none, gives 2, 4, 3",
    people: 9,
    capacities: [2, 4, null],
    sizes: [2, 4, 3],
  },
];

for (const scenario of SCENARIOS) {
  test(`Allocate: ${scenario.name}, with nobody waiting`, async () => {
    const { clock, createGroup, joinCrowd, allocate } = await harness();
    for (const [i, capacity] of scenario.capacities.entries()) {
      await createGroup(`Group ${i + 1}`, capacity ?? undefined);
      clock.advanceSeconds(1);
    }
    await joinCrowd(scenario.people);

    const board = await allocate();

    assert.deepEqual(sizes(board), scenario.sizes);
    assert.deepEqual(board.waiting, []);
  });
}

test("Allocate with no groups answers 409 no_groups and doesn't start allocation", async () => {
  const { send, joinCrowd, board, myGroup } = await harness();
  const [first] = await joinCrowd(4);

  const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate");

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "no_groups" });
  const after = await board();
  assert.equal(after.allocation_started_at, null);
  assert.equal(after.waiting.length, 4);
  assert.equal((await myGroup(first!)).status, "waiting");
});

test("3 people in 2 groups answers 409 too_few_participants, needing 1 more", async () => {
  const { send, createGroup, joinCrowd, board } = await harness();
  await createGroup("Mixer A");
  await createGroup("Mixer B");
  await joinCrowd(3);

  const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate");

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "too_few_participants", needed: 1 });
  const after = await board();
  assert.equal(after.allocation_started_at, null);
  assert.equal(after.waiting.length, 3);
});

test("too_few_participants counts how many more are needed, and nobody at all is too few", async () => {
  const { send, createGroup } = await harness();
  for (const name of ["Mixer A", "Mixer B", "Mixer C"]) await createGroup(name);

  const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate");

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "too_few_participants", needed: 6 });
});

test("after Allocate, with groups of 3 and 2, the next person joins the group of 2", async () => {
  const { clock, createGroup, joinCrowd, allocate, join, board } = await harness();
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  const smaller = await createGroup("Mixer B");
  await joinCrowd(5);
  assert.deepEqual(sizes(await allocate()), [3, 2]);
  clock.advanceSeconds(120);

  const mine = await join("user-1");

  assert.equal(mine.status, "placed");
  assert.equal(mine.allocation_started, true);
  assert.equal(mine.group!.id, smaller.id);
  assert.ok(mine.group!.members.some(({ display_name }) => display_name === "Alex"));
  const after = await board();
  assert.deepEqual(sizes(after), [3, 3]);
  assert.deepEqual(after.waiting, []);
  // Placed as they joined, which is what the report's time to group measures.
  const placed = after.groups[1]!.members.find(({ user_id }) => user_id === "user-1")!;
  assert.equal(placed.how, "latecomer");
  assert.equal(placed.joined_at, clock.now().toISOString());
  assert.equal(placed.placed_at, clock.now().toISOString());
});

test("with groups of 3 and 2 both at capacity, the next person still joins the group of 2", async () => {
  const { clock, createGroup, joinCrowd, allocate, join, board } = await harness();
  await createGroup("Mixer A", 3);
  clock.advanceSeconds(1);
  const smaller = await createGroup("Mixer B", 2);
  await joinCrowd(5);
  assert.deepEqual(sizes(await allocate()), [3, 2]);

  assert.equal((await join("user-1")).group!.id, smaller.id);

  // The board then shows the group past its capacity, which the Groups screen flags.
  const after = await board();
  assert.deepEqual(
    after.groups.map(({ capacity, members }) => [members.length, capacity]),
    [
      [3, 3],
      [3, 2],
    ],
  );
  assert.deepEqual(after.waiting, []);
});

test("with no groups left, a latecomer waits, and knows allocation has started", async () => {
  const { createGroup, joinCrowd, allocate, join, board } = await harness();
  const only = await createGroup("Mixer A");
  const [first, second] = await joinCrowd(2);
  await allocate();
  await deleteGroup(only.id);

  assert.deepEqual(await join("user-1"), {
    status: "waiting",
    allocation_started: true,
    group: null,
  });
  assert.deepEqual(
    (await board()).waiting.map(({ user_id }) => user_id),
    [first, second, "user-1"],
  );
});

test("20 people with 3 groups of capacity 5, 14 of them joining at once, give 7, 7, 6", async () => {
  const { clock, createGroup, arriveCrowd, joinCrowd, allocate, join, board } = await harness({
    instances: 2,
  });
  for (const name of ["Mixer A", "Mixer B", "Mixer C"]) {
    await createGroup(name, 5);
    clock.advanceSeconds(1);
  }
  // Allocate takes 2 for each group, so the rush comes after the first 6.
  await joinCrowd(6);
  assert.deepEqual(sizes(await allocate()), [2, 2, 2]);
  const rush = await arriveCrowd(14);

  // Half to each instance, so only a lock in the database keeps them taking turns.
  const answers = await Promise.all(rush.map((userId, i) => join(userId, i % 2)));

  assert.ok(answers.every(({ status }) => status === "placed"));
  const after = await board();
  assert.deepEqual(sizes(after), [7, 7, 6]);
  assert.deepEqual(after.waiting, []);
  assert.equal(after.joined_count, 20);
  const placed = after.groups.flatMap((group) => group.members.map(({ user_id }) => user_id));
  assert.equal(new Set(placed).size, 20, "nobody is in two groups");
});
