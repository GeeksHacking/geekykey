import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { anotherTestDb, fakeClock, screensSchemas, testApp, testDb } from "../test-helpers.ts";
import type { Shuffle } from "./groups.ts";
import { users } from "./schema.ts";

const ORGANIZER = "dev-organizer-1";
const JOINED_AT = "2026-11-05T01:00:00.000Z";

const { myGroupResponseSchema, groupBoardResponseSchema, eventGroupSchema } = screensSchemas;

/**
 * The Event screens' own list of the CSV's columns (apps/event-web), so the two
 * can't drift apart. Imported by a path tsc doesn't follow, since the screens'
 * code is checked with their settings, not the service's.
 */
const SCREENS_TYPES = fileURLToPath(
  new URL("../../../event-web/src/api/types.ts", import.meta.url),
);
const { GROUPS_EXPORT_CSV_COLUMNS } = (await import(/* @vite-ignore */ SCREENS_TYPES)) as {
  GROUPS_EXPORT_CSV_COLUMNS: readonly string[];
};

/** The CSV's first line (draft for the API agreement's 0.14). */
const EXPORT_HEADER = "user_id,display_name,group_name,joined_at,placed_at,how";

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
  connect_across: "token_kinds" | "groups";
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
async function harness({
  shuffle,
  instances = 1,
  promoted = [],
}: {
  shuffle?: Shuffle;
  instances?: 1 | 2;
  /**
   * People a later instance has on its organizer list as well, as if ORGANIZERS changed while
   * they were joined. That instance is the last, which `promotedInstance` names.
   */
  promoted?: string[];
} = {}) {
  const clock = fakeClock(JOINED_AT);
  const app = testApp({}, { now: clock.now, shuffle });
  const apps = [app];
  if (instances === 2) {
    secondInstanceDb ??= anotherTestDb();
    apps.push(testApp({}, { now: clock.now, shuffle, db: secondInstanceDb }));
  }
  if (promoted.length > 0) {
    apps.push(
      testApp({ ORGANIZERS: [ORGANIZER, ...promoted].join(",") }, { now: clock.now, shuffle }),
    );
  }
  const promotedInstance = apps.length - 1;
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
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
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

  const board = async (instance = 0) =>
    read<BoardBody>(
      await send(ORGANIZER, "GET", "/api/v1/admin/groups", undefined, instance),
      groupBoardResponseSchema,
    );

  const myGroup = async (userId: string, instance = 0) =>
    read<MyGroupBody>(
      await send(userId, "GET", "/api/v1/me/group", undefined, instance),
      myGroupResponseSchema,
    );

  const join = async (userId: string, instance = 0) =>
    read<MyGroupBody>(
      await send(userId, "POST", "/api/v1/me/group", undefined, instance),
      myGroupResponseSchema,
    );

  /** Deletes a group, which sends its members back to waiting. */
  const deleteGroup = async (groupId: string) => {
    const response = await send(ORGANIZER, "DELETE", `/api/v1/admin/groups/${groupId}`);
    assert.equal(response.status, 204);
  };

  /** Puts `userId` in the group `groupId`, or sends them back to waiting with null. */
  const place = async (userId: string, groupId: string | null) =>
    read<BoardBody>(
      await send(ORGANIZER, "PUT", `/api/v1/admin/groups/members/${userId}`, {
        group_id: groupId,
      }),
      groupBoardResponseSchema,
    );

  const allocate = async (instance = 0) =>
    read<BoardBody>(
      await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate", undefined, instance),
      groupBoardResponseSchema,
    );

  /**
   * The Groups screen's one-step form: makes the groups and allocates everyone who has joined.
   * Gives the raw answer, since a refusal is part of what these tests check.
   */
  const split = async (body: unknown, instance = 0) =>
    send(ORGANIZER, "POST", "/api/v1/admin/groups/split", body, instance);

  /** Empties every group and the waiting list, and un-starts allocation, keeping the groups. */
  const reset = async () =>
    read<BoardBody>(
      await send(ORGANIZER, "POST", "/api/v1/admin/groups/reset"),
      groupBoardResponseSchema,
    );

  /** The groups CSV's lines as an organizer downloads it, which must be a 200. */
  const exportLines = async (): Promise<string[]> => {
    const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups/export.csv");
    assert.equal(response.status, 200);
    const csv = await response.text();
    assert.ok(csv.endsWith("\r\n"), "the last line ends like the others");
    return csv.slice(0, -2).split("\r\n");
  };

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
    promotedInstance,
    send,
    read,
    createGroup,
    board,
    myGroup,
    join,
    arriveCrowd,
    joinCrowd,
    deleteGroup,
    place,
    allocate,
    split,
    reset,
    exportLines,
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
    connect_across: "token_kinds",
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

test("a group can have tags and a location, trimmed, and a blank location is none", async () => {
  const { send, read, createGroup } = await harness();

  const tagged = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "POST", "/api/v1/admin/groups", {
      name: "Mixer A",
      tags: [" Mixer ", "Year 1"],
      location: "  Room 3-01 ",
    }),
    eventGroupSchema,
    201,
  );
  const plain = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name: "Mixer B", location: "  " }),
    eventGroupSchema,
    201,
  );

  assert.deepEqual([tagged.tags, tagged.location], [["Mixer", "Year 1"], "Room 3-01"]);
  assert.deepEqual([plain.tags, plain.location], [[], null]);
  assert.equal((await createGroup("Mixer C")).location, null);
});

test("tags allow at most 5, each 1 to 80 characters, and a location at most 80", async () => {
  const { send, read, board } = await harness();

  for (const [body, path] of [
    [{ tags: ["a", "b", "c", "d", "e", "f"] }, ["tags"]],
    [{ tags: ["fine", "   "] }, ["tags", 1]],
    [{ tags: ["x".repeat(81)] }, ["tags", 0]],
    [{ location: "x".repeat(81) }, ["location"]],
  ] as const) {
    const response = await send(ORGANIZER, "POST", "/api/v1/admin/groups", {
      name: "Mixer A",
      ...body,
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const { error, issues } = (await response.json()) as {
      error: string;
      issues: { path: (string | number)[] }[];
    };
    assert.equal(error, "validation_failed");
    assert.deepEqual(issues[0]!.path, path);
  }
  assert.deepEqual((await board()).groups, []);

  // Counted in code points, so 5 tags of 80 emoji each pass.
  const full = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "POST", "/api/v1/admin/groups", {
      name: "Mixer A",
      tags: Array.from({ length: 5 }, () => "😀".repeat(80)),
      location: "😀".repeat(80),
    }),
    eventGroupSchema,
    201,
  );
  assert.equal(full.tags.length, 5);
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

test("editing a group sets all its fields, and a field left out is none", async () => {
  const { send, read, createGroup, board } = await harness();
  const group = await createGroup("Mixer A", 6);

  const edited = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "PUT", `/api/v1/admin/groups/${group.id}`, {
      name: " Mixer B ",
      tags: ["Year 1"],
      location: "Hall",
      capacity: 4,
    }),
    eventGroupSchema,
  );
  assert.deepEqual(edited, {
    id: group.id,
    name: "Mixer B",
    tags: ["Year 1"],
    location: "Hall",
    capacity: 4,
    members: [],
  });

  const bare = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "PUT", `/api/v1/admin/groups/${group.id}`, { name: "Mixer B" }),
    eventGroupSchema,
  );
  assert.deepEqual([bare.tags, bare.location, bare.capacity], [[], null, null]);
  assert.deepEqual((await board()).groups, [bare]);
});

test("editing a group can't take another's name, whatever its capitals, but can keep its own", async () => {
  const { clock, send, read, createGroup, board } = await harness();
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  const other = await createGroup("Mixer B");

  const response = await send(ORGANIZER, "PUT", `/api/v1/admin/groups/${other.id}`, {
    name: "MIXER A",
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "name_taken" });
  assert.equal((await board()).groups[1]!.name, "Mixer B");

  const recapped = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "PUT", `/api/v1/admin/groups/${other.id}`, { name: "mixer b" }),
    eventGroupSchema,
  );
  assert.equal(recapped.name, "mixer b");
});

test("editing a group that doesn't exist answers 404 not_found", async () => {
  const { send } = await harness();

  const response = await send(ORGANIZER, "PUT", "/api/v1/admin/groups/no-such-group", {
    name: "Mixer A",
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("editing a group checks its fields as creating one does", async () => {
  const { send, createGroup } = await harness();
  const group = await createGroup("Mixer A");

  const response = await send(ORGANIZER, "PUT", `/api/v1/admin/groups/${group.id}`, {
    name: "Mixer A",
    tags: ["a", "b", "c", "d", "e", "f"],
  });

  assert.equal(response.status, 400);
  const { issues } = (await response.json()) as { issues: { path: string[] }[] };
  assert.deepEqual(issues[0]!.path, ["tags"]);
});

test("lowering a group's capacity below its size moves nobody, and shows it over capacity", async () => {
  const { send, read, createGroup, joinCrowd, allocate } = await harness();
  const group = await createGroup("Mixer A");
  await joinCrowd(4);
  await allocate();

  const lowered = await read<BoardBody["groups"][number]>(
    await send(ORGANIZER, "PUT", `/api/v1/admin/groups/${group.id}`, {
      name: "Mixer A",
      capacity: 2,
    }),
    eventGroupSchema,
  );

  assert.deepEqual([lowered.members.length, lowered.capacity], [4, 2]);
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
  ["PUT", "/api/v1/admin/groups/some-group"],
  ["DELETE", "/api/v1/admin/groups/some-group"],
  ["POST", "/api/v1/admin/groups/allocate"],
  ["POST", "/api/v1/admin/groups/reset"],
  ["POST", "/api/v1/admin/groups/split"],
  ["GET", "/api/v1/admin/groups/export.csv"],
  ["PUT", "/api/v1/admin/groups/members/user-2"],
  ["DELETE", "/api/v1/admin/groups/members/user-2"],
] as const;

test("a participant is refused on every organizer route", async () => {
  const { send, board, join } = await harness();
  await join("user-2");

  for (const [method, path] of ORGANIZER_ROUTES) {
    const response = await send(
      "user-1",
      method,
      path,
      method === "POST" || method === "PUT" ? { name: "Mine", group_id: null } : undefined,
    );
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: "forbidden" });
  }
  const after = await board();
  assert.deepEqual(after.groups, []);
  assert.equal(after.joined_count, 1);
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

test("deleting a group sends its members back to waiting, and moves nobody else", async () => {
  const { clock, createGroup, joinCrowd, allocate, deleteGroup, board, myGroup } = await harness();
  const doomed = await createGroup("Mixer A");
  clock.advanceSeconds(1);
  const kept = await createGroup("Mixer B");
  const crowd = await joinCrowd(4);
  const before = await allocate();
  const doomedMembers = before.groups[0]!.members.map(({ user_id }) => user_id);

  await deleteGroup(doomed.id);

  const after = await board();
  assert.deepEqual(
    after.groups.map(({ id }) => id),
    [kept.id],
  );
  assert.deepEqual(after.groups[0]!.members, before.groups[1]!.members);
  assert.deepEqual(after.waiting.map(({ user_id }) => user_id).sort(), doomedMembers.sort());
  assert.equal(after.joined_count, crowd.length);
  for (const userId of doomedMembers) {
    assert.deepEqual(await myGroup(userId), {
      status: "waiting",
      allocation_started: true,
      group: null,
    });
  }
});

test("deleting a group that doesn't exist answers 404 not_found", async () => {
  const { send } = await harness();

  const response = await send(ORGANIZER, "DELETE", "/api/v1/admin/groups/no-such-group");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("pressing Allocate again places a deleted group's members, and moves nobody else", async () => {
  const { clock, createGroup, joinCrowd, allocate, deleteGroup, board } = await harness();
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
  const { createGroup, joinCrowd, allocate, deleteGroup, join, board } = await harness();
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

test("the CSV downloads as a file, with the columns the Event screens expect", async () => {
  const { send, exportLines } = await harness();

  const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups/export.csv");

  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="geekykey-groups.csv"',
  );
  assert.equal(GROUPS_EXPORT_CSV_COLUMNS.join(","), EXPORT_HEADER);
  assert.deepEqual(await exportLines(), [EXPORT_HEADER], "nobody has joined, so no rows");
});

test("the CSV has a row for each person, oldest join first, with their group, times and how", async () => {
  const { clock, createGroup, join, allocate, exportLines } = await harness({
    shuffle: (items) => items,
  });
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  for (const userId of ["user-1", "user-2", "user-3", "user-4"]) {
    clock.advanceSeconds(10);
    await join(userId);
  }
  clock.advanceSeconds(60);
  await allocate();
  clock.advanceSeconds(60);
  await testDb().insert(users).values({ id: "user-5", displayName: "Eli" });
  await join("user-5");

  assert.deepEqual(await exportLines(), [
    EXPORT_HEADER,
    "user-1,Alex,Mixer A,2026-11-05T01:00:11.000Z,2026-11-05T01:01:41.000Z,allocated",
    "user-2,Bala,Mixer B,2026-11-05T01:00:21.000Z,2026-11-05T01:01:41.000Z,allocated",
    "user-3,Chen,Mixer A,2026-11-05T01:00:31.000Z,2026-11-05T01:01:41.000Z,allocated",
    "user-4,Dewi,Mixer B,2026-11-05T01:00:41.000Z,2026-11-05T01:01:41.000Z,allocated",
    "user-5,Eli,Mixer A,2026-11-05T01:02:41.000Z,2026-11-05T01:02:41.000Z,latecomer",
  ]);
});

test("someone still waiting has a row, with their group, placed time and how empty", async () => {
  const { join, exportLines } = await harness();

  await join("user-1");

  assert.deepEqual((await exportLines()).slice(1), [`user-1,Alex,,${JOINED_AT},,`]);
});

test("someone an organizer placed says so", async () => {
  const { clock, createGroup, join, place, exportLines } = await harness();
  const group = await createGroup("Mixer A");
  await join("user-1");
  clock.advanceSeconds(300);

  await place("user-1", group.id);

  assert.deepEqual((await exportLines()).slice(1), [
    `user-1,Alex,Mixer A,${JOINED_AT},2026-11-05T01:05:00.000Z,organizer`,
  ]);
});

test("someone sent back to waiting, or whose group was deleted, has their group, placed time and how empty", async () => {
  const { clock, createGroup, joinCrowd, allocate, place, deleteGroup, exportLines } =
    await harness({ shuffle: (items) => items });
  const doomed = await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  const [first, second, third, fourth] = await joinCrowd(4);
  const at = clock.now().toISOString();
  await allocate();

  // In order, first and third went to Mixer A, second and fourth to Mixer B.
  await place(second!, null);
  await deleteGroup(doomed.id);

  assert.deepEqual((await exportLines()).slice(1), [
    `${first},Person 01,,${at},,`,
    `${second},Person 02,,${at},,`,
    `${third},Person 03,,${at},,`,
    `${fourth},Person 04,Mixer B,${at},${at},allocated`,
  ]);
});

test("a name with a comma or a quote is quoted, and one like a formula is left as typed", async () => {
  const { createGroup, join, allocate, exportLines } = await harness({
    shuffle: (items) => items,
  });
  await createGroup("Hall, Level 2");
  await testDb()
    .update(users)
    .set({ displayName: 'Sam "the" Tapper' })
    .where(eq(users.id, "user-1"));
  await testDb().update(users).set({ displayName: "=1+1" }).where(eq(users.id, "user-2"));
  await join("user-1");
  await join("user-2");
  await allocate();

  assert.deepEqual((await exportLines()).slice(1), [
    `user-1,"Sam ""the"" Tapper","Hall, Level 2",${JOINED_AT},${JOINED_AT},allocated`,
    `user-2,=1+1,"Hall, Level 2",${JOINED_AT},${JOINED_AT},allocated`,
  ]);
});

/** The member `userId` on `board`, with their group's ID, or undefined when not placed. */
const placedOn = (board: BoardBody, userId: string) => {
  for (const group of board.groups) {
    const member = group.members.find(({ user_id }) => user_id === userId);
    if (member) return { ...member, group_id: group.id };
  }
  return undefined;
};

test("an organizer can put a waiting participant in a group before Allocate, and Allocate leaves them", async () => {
  const { clock, createGroup, join, place, allocate, joinCrowd } = await harness();
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  const chosen = await createGroup("Mixer B");
  await join("user-1");
  const joinedAt = clock.now().toISOString();
  clock.advanceSeconds(30);

  const board = await place("user-1", chosen.id);

  assert.deepEqual(placedOn(board, "user-1"), {
    user_id: "user-1",
    display_name: "Alex",
    joined_at: joinedAt,
    placed_at: clock.now().toISOString(),
    how: "organizer",
    group_id: chosen.id,
  });
  assert.deepEqual(board.waiting, []);
  assert.equal(board.allocation_started_at, null);

  await joinCrowd(3);
  const after = await allocate();
  assert.equal(placedOn(after, "user-1")!.group_id, chosen.id);
  assert.equal(placedOn(after, "user-1")!.how, "organizer");
});

test("an organizer can move a placed participant to another group, and they see it", async () => {
  const { clock, createGroup, joinCrowd, allocate, place, myGroup } = await harness();
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  const crowd = await joinCrowd(4);
  const before = await allocate();
  const mover = crowd[0]!;
  const from = placedOn(before, mover)!.group_id;
  const to = before.groups.find(({ id }) => id !== from)!;
  clock.advanceSeconds(60);

  const after = await place(mover, to.id);

  assert.equal(placedOn(after, mover)!.group_id, to.id);
  assert.equal(placedOn(after, mover)!.how, "organizer");
  assert.equal(placedOn(after, mover)!.placed_at, clock.now().toISOString());
  const mine = await myGroup(mover);
  assert.equal(mine.group!.id, to.id);
  assert.equal(mine.group!.name, to.name);
});

test("putting someone in the group they're already in changes nothing", async () => {
  const { clock, createGroup, joinCrowd, allocate, place } = await harness();
  await createGroup("Mixer A");
  const [first] = await joinCrowd(2);
  const before = await allocate();
  clock.advanceSeconds(60);

  const after = await place(first!, before.groups[0]!.id);

  assert.deepEqual(placedOn(after, first!), placedOn(before, first!));
});

test("an organizer can send a placed participant back to waiting", async () => {
  const { createGroup, joinCrowd, allocate, place, myGroup } = await harness();
  await createGroup("Mixer A");
  const [first] = await joinCrowd(2);
  await allocate();

  const board = await place(first!, null);

  assert.equal(placedOn(board, first!), undefined);
  assert.deepEqual(
    board.waiting.map(({ user_id }) => user_id),
    [first],
  );
  assert.deepEqual(await myGroup(first!), {
    status: "waiting",
    allocation_started: true,
    group: null,
  });
});

test("an organizer can put someone in a full group, which the board shows over capacity", async () => {
  const { createGroup, joinCrowd, allocate, place } = await harness();
  const full = await createGroup("Small room", 2);
  const [first, second, third] = await joinCrowd(3);
  await place(first!, full.id);
  await place(second!, full.id);

  const board = await place(third!, full.id);

  assert.deepEqual(
    board.groups.map(({ capacity, members }) => [members.length, capacity]),
    [[3, 2]],
  );
  assert.deepEqual((await allocate()).groups[0]!.members.length, 3);
});

test("putting in a group someone who hasn't joined joins them", async () => {
  const { clock, createGroup, place, myGroup } = await harness();
  const group = await createGroup("Mixer A");
  clock.advanceSeconds(5);

  const board = await place("user-2", group.id);

  assert.equal(board.joined_count, 1);
  const member = placedOn(board, "user-2")!;
  assert.equal(member.joined_at, clock.now().toISOString());
  assert.equal(member.placed_at, clock.now().toISOString());
  assert.equal((await myGroup("user-2")).status, "placed");

  const waiting = await place("user-3", null);
  assert.deepEqual(
    waiting.waiting.map(({ user_id }) => user_id),
    ["user-3"],
  );
});

test("putting someone in a group answers 404 not_found for a group or a user that doesn't exist", async () => {
  const { send, createGroup, join, board } = await harness();
  const group = await createGroup("Mixer A");
  await join("user-1");

  for (const [userId, groupId] of [
    ["user-1", "no-such-group"],
    ["no-such-user", group.id],
    ["no-such-user", null],
  ] as const) {
    const response = await send(ORGANIZER, "PUT", `/api/v1/admin/groups/members/${userId}`, {
      group_id: groupId,
    });
    assert.equal(response.status, 404, `${userId} to ${groupId}`);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }
  const after = await board();
  assert.equal(after.joined_count, 1);
  assert.deepEqual(
    after.waiting.map(({ user_id }) => user_id),
    ["user-1"],
  );
});

test("putting someone in a group needs group_id, a string or null", async () => {
  const { send, join } = await harness();
  await join("user-1");

  for (const body of [{}, { group_id: 3 }]) {
    const response = await send(ORGANIZER, "PUT", "/api/v1/admin/groups/members/user-1", body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const { error, issues } = (await response.json()) as {
      error: string;
      issues: { path: string[] }[];
    };
    assert.equal(error, "validation_failed");
    assert.deepEqual(issues[0]!.path, ["group_id"]);
  }
});

test("an organizer account can't be put in a group, and answers 403 forbidden", async () => {
  const { send, createGroup, board } = await harness();
  const group = await createGroup("Mixer A");

  const response = await send(ORGANIZER, "PUT", `/api/v1/admin/groups/members/${ORGANIZER}`, {
    group_id: group.id,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal((await board()).joined_count, 0);
});

test("a removed participant leaves the board, and can join again", async () => {
  const { clock, send, createGroup, joinCrowd, allocate, board, myGroup, join } = await harness();
  const group = await createGroup("Mixer A");
  const [leaver, stayer] = await joinCrowd(2);
  await allocate();

  const response = await send(ORGANIZER, "DELETE", `/api/v1/admin/groups/members/${leaver}`);

  assert.equal(response.status, 204);
  const after = await board();
  assert.equal(after.joined_count, 1);
  assert.deepEqual(
    after.groups[0]!.members.map(({ user_id }) => user_id),
    [stayer],
  );
  assert.deepEqual(await myGroup(leaver!), {
    status: "not_joined",
    allocation_started: true,
    group: null,
  });

  // Back again after Allocate, they're a latecomer, placed as they join.
  clock.advanceSeconds(300);
  const again = await join(leaver!);
  assert.equal(again.status, "placed");
  assert.equal(again.group!.id, group.id);
  const rejoined = placedOn(await board(), leaver!)!;
  assert.equal(rejoined.how, "latecomer");
  assert.equal(rejoined.joined_at, clock.now().toISOString());
});

test("removing someone who hasn't joined answers 404 not_found", async () => {
  const { send } = await harness();

  const response = await send(ORGANIZER, "DELETE", "/api/v1/admin/groups/members/user-1");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("someone made an organizer after joining is kept out of Allocate, the board and their group", async () => {
  const {
    promotedInstance: later,
    createGroup,
    join,
    joinCrowd,
    allocate,
    board,
    myGroup,
  } = await harness({ promoted: ["user-1"] });
  await createGroup("Mixer A");
  await join("user-1");
  const crowd = await joinCrowd(2);

  const after = await allocate(later);

  assert.equal(after.joined_count, 2);
  assert.deepEqual(after.waiting, []);
  assert.deepEqual(after.groups[0]!.members.map(({ user_id }) => user_id).sort(), crowd.sort());
  assert.deepEqual(await board(later), after);
  assert.deepEqual(await myGroup("user-1", later), {
    status: "not_joined",
    allocation_started: true,
    group: null,
  });
});

test("someone made an organizer after being placed leaves their group's size and names", async () => {
  const {
    clock,
    promotedInstance: later,
    createGroup,
    join,
    arriveCrowd,
    joinCrowd,
    allocate,
    board,
    myGroup,
  } = await harness({ promoted: ["user-1"] });
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  await join("user-1");
  await joinCrowd(3);
  const before = await allocate();
  const theirs = placedOn(before, "user-1")!.group_id;
  const mate = before.groups
    .find(({ id }) => id === theirs)!
    .members.find(({ user_id }) => user_id !== "user-1")!;

  const after = await board(later);
  assert.deepEqual(
    after.groups.map(({ id, members }) => [id, members.length]),
    before.groups.map(({ id }) => [id, id === theirs ? 1 : 2]),
  );
  assert.deepEqual(
    (await myGroup(mate.user_id, later)).group!.members.map(({ display_name }) => display_name),
    [mate.display_name],
  );

  // Their group is now the smaller, so the next latecomer goes there.
  const [latecomer] = await arriveCrowd(1);
  assert.equal((await join(latecomer!, later)).group!.id, theirs);
});

test("reset after Allocate keeps the groups, and nobody has joined", async () => {
  const { clock, createGroup, joinCrowd, allocate, reset, board, myGroup } = await harness();
  const first = await createGroup("Mixer A", 3);
  clock.advanceSeconds(1);
  const second = await createGroup("Mixer B");
  const [someone] = await joinCrowd(4);
  await allocate();

  const after = await reset();

  assert.deepEqual(after, {
    allocation_started_at: null,
    connect_across: "token_kinds",
    joined_count: 0,
    groups: [
      { ...first, members: [] },
      { ...second, members: [] },
    ],
    waiting: [],
  });
  assert.deepEqual(await board(), after);
  assert.deepEqual(await myGroup(someone!), {
    status: "not_joined",
    allocation_started: false,
    group: null,
  });
});

test("after a reset, participants join and wait again, and Allocate starts the next trial", async () => {
  const { clock, createGroup, joinCrowd, allocate, reset, join, board } = await harness();
  await createGroup("Mixer A");
  clock.advanceSeconds(1);
  await createGroup("Mixer B");
  await joinCrowd(4);
  await allocate();
  await reset();
  clock.advanceSeconds(600);

  // Not a latecomer: allocation hasn't started for this trial.
  assert.deepEqual(await join("user-1"), {
    status: "waiting",
    allocation_started: false,
    group: null,
  });
  const [, , last] = await joinCrowd(3);
  const nextTrial = clock.now().toISOString();

  const after = await allocate();

  assert.equal(after.allocation_started_at, nextTrial);
  assert.equal(after.joined_count, 4);
  assert.deepEqual(sizes(after), [2, 2]);
  assert.deepEqual(after.waiting, []);
  const placed = placedOn(after, last!)!;
  assert.equal(placed.how, "allocated");
  assert.equal(placed.joined_at, nextTrial);
  assert.deepEqual(await board(), after);
});

test("split: 4 joined in 2 groups of 2 makes Group 1 and Group 2, with their locations, and fills them 2, 2", async () => {
  const { clock, joinCrowd, split, read, board } = await harness();
  await joinCrowd(4);
  clock.advanceSeconds(60);
  const placedAt = clock.now().toISOString();

  const after = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 2, locations: ["Room 3A", "Lobby"] }),
    groupBoardResponseSchema,
    201,
  );

  assert.deepEqual(
    after.groups.map(({ name, tags, location, capacity }) => ({ name, tags, location, capacity })),
    [
      { name: "Group 1", tags: [], location: "Room 3A", capacity: 2 },
      { name: "Group 2", tags: [], location: "Lobby", capacity: 2 },
    ],
  );
  assert.deepEqual(sizes(after), [2, 2]);
  assert.deepEqual(after.waiting, []);
  assert.equal(after.allocation_started_at, placedAt);
  for (const member of after.groups.flatMap((group) => group.members)) {
    assert.equal(member.how, "allocated");
    assert.equal(member.placed_at, placedAt);
  }
  assert.deepEqual(await board(), after);
});

test("split: 5 joined in 2 groups of 2 gives 3, 2, the first over its capacity", async () => {
  const { joinCrowd, split, read } = await harness();
  await joinCrowd(5);

  const after = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 2 }),
    groupBoardResponseSchema,
    201,
  );

  // The board shows the first past its capacity, which the Groups screen flags.
  assert.deepEqual(
    after.groups.map(({ capacity, members }) => [members.length, capacity]),
    [
      [3, 2],
      [2, 2],
    ],
  );
  assert.deepEqual(after.waiting, []);
});

test("split: 3 joined in 2 groups makes nothing and needs 1 more, and the same form works once they join", async () => {
  const { joinCrowd, split, read, board } = await harness();
  await joinCrowd(3);
  const form = { group_count: 2, people_per_group: 2, locations: ["Room 3A", null] };

  const refused = await split(form);

  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { error: "too_few_participants", needed: 1 });
  const before = await board();
  assert.deepEqual(before.groups, []);
  assert.equal(before.allocation_started_at, null);
  assert.equal(before.waiting.length, 3);

  await joinCrowd(1);
  const after = await read<BoardBody>(await split(form), groupBoardResponseSchema, 201);
  assert.deepEqual(
    after.groups.map(({ name }) => name),
    ["Group 1", "Group 2"],
  );
  assert.deepEqual(sizes(after), [2, 2]);
});

test("split with any group already there answers 409 groups_exist and makes or places nothing", async () => {
  const { createGroup, joinCrowd, split, board } = await harness();
  const existing = await createGroup("Mixer A");
  await joinCrowd(6);

  const refused = await split({ group_count: 2, people_per_group: 3 });

  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { error: "groups_exist" });
  const after = await board();
  assert.deepEqual(after.groups, [existing]);
  assert.equal(after.allocation_started_at, null);
  assert.equal(after.waiting.length, 6);
});

test("two organizers sending the form at once, to two instances, leave one set of groups", async () => {
  const { joinCrowd, split, board } = await harness({ instances: 2 });
  await joinCrowd(6);
  const form = { group_count: 3, people_per_group: 2 };

  const answers = await Promise.all([split(form, 0), split(form, 1)]);

  assert.deepEqual(answers.map(({ status }) => status).sort(), [201, 409]);
  const refused = answers.find(({ status }) => status === 409)!;
  assert.deepEqual(await refused.json(), { error: "groups_exist" });
  const after = await board();
  assert.deepEqual(
    after.groups.map(({ name }) => name),
    ["Group 1", "Group 2", "Group 3"],
  );
  assert.deepEqual(sizes(after), [2, 2, 2]);
});

test("after a split, a latecomer is placed as usual, and their phone shows the form's location", async () => {
  const { clock, joinCrowd, split, read, join } = await harness();
  await joinCrowd(5);
  const after = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 3, locations: ["Room 3A", "Lobby"] }),
    groupBoardResponseSchema,
    201,
  );
  assert.deepEqual(sizes(after), [3, 2]);
  clock.advanceSeconds(120);

  const mine = await join("user-1");

  assert.equal(mine.status, "placed");
  assert.equal(mine.group!.id, after.groups[1]!.id);
  assert.equal(mine.group!.name, "Group 2");
  assert.equal(mine.group!.location, "Lobby");
});

test("a participant placed by a split sees the location entered for their group", async () => {
  const { joinCrowd, split, read, myGroup } = await harness();
  const crowd = await joinCrowd(4);
  const after = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 2, locations: ["Room 3A"] }),
    groupBoardResponseSchema,
    201,
  );

  for (const userId of crowd) {
    const mine = await myGroup(userId);
    const theirs = placedOn(after, userId)!.group_id;
    assert.equal(mine.group!.id, theirs);
    // Only the first was given a location, so the second has none.
    assert.equal(mine.group!.location, theirs === after.groups[0]!.id ? "Room 3A" : null);
  }
});

test("after deleting the groups, a split makes new ones and places everyone waiting", async () => {
  const { joinCrowd, split, read, deleteGroup } = await harness();
  await joinCrowd(6);
  const first = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 3 }),
    groupBoardResponseSchema,
    201,
  );
  for (const group of first.groups) await deleteGroup(group.id);

  const second = await read<BoardBody>(
    await split({ group_count: 3, people_per_group: 2 }),
    groupBoardResponseSchema,
    201,
  );

  assert.deepEqual(
    second.groups.map(({ name, capacity }) => [name, capacity]),
    [
      ["Group 1", 2],
      ["Group 2", 2],
      ["Group 3", 2],
    ],
  );
  assert.deepEqual(sizes(second), [2, 2, 2]);
  assert.deepEqual(second.waiting, []);
});

test("split's numbers are whole numbers above 0, and its locations follow a group's location rule", async () => {
  const { joinCrowd, split, read, board } = await harness();
  await joinCrowd(4);

  for (const body of [
    {},
    { group_count: 2 },
    { group_count: 0, people_per_group: 2 },
    { group_count: 2, people_per_group: 0 },
    { group_count: 1.5, people_per_group: 2 },
    { group_count: 2, people_per_group: -1 },
    { group_count: "2", people_per_group: 2 },
    { group_count: 2, people_per_group: 2, locations: ["a".repeat(81)] },
    { group_count: 2, people_per_group: 2, locations: ["Room 3A", "Lobby", "Hall"] },
  ]) {
    const response = await split(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(((await response.json()) as { error: string }).error, "validation_failed");
  }
  assert.deepEqual((await board()).groups, []);

  // Trimmed, a blank one is none, and 80 code points is allowed.
  const longest = "🙂".repeat(80);
  const after = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 2, locations: ["  Room 3A ", longest] }),
    groupBoardResponseSchema,
    201,
  );
  assert.deepEqual(
    after.groups.map(({ location }) => location),
    ["Room 3A", longest],
  );
});

test("a blank location in a split is none", async () => {
  const { joinCrowd, split, read } = await harness();
  await joinCrowd(4);

  const after = await read<BoardBody>(
    await split({ group_count: 2, people_per_group: 2, locations: ["   ", ""] }),
    groupBoardResponseSchema,
    201,
  );

  assert.deepEqual(
    after.groups.map(({ location }) => location),
    [null, null],
  );
});
