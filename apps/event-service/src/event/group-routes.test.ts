import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeClock, screensSchemas, testApp, testDb } from "../test-helpers.ts";
import { users } from "./schema.ts";

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

/** Every test goes through the routes a screen calls, and reads answers as the screens do. */
async function harness() {
  const clock = fakeClock(JOINED_AT);
  const app = testApp({}, { now: clock.now });
  // Dev-login signs in only someone who has logged in to this event before.
  await testDb().insert(users).values(PEOPLE);

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return login.headers.get("set-cookie")!.split(";")[0]!;
  };

  /** Sends a request as `userId`, or with no session when it's null. */
  const send = async (
    userId: string | null,
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ) =>
    app.request(path, {
      method,
      headers: {
        ...(userId === null ? {} : { Cookie: await signIn(userId) }),
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

  const createGroup = async (name: string) =>
    read<BoardBody["groups"][number]>(
      await send(ORGANIZER, "POST", "/api/v1/admin/groups", { name }),
      eventGroupSchema,
      201,
    );

  const board = async () =>
    read<BoardBody>(await send(ORGANIZER, "GET", "/api/v1/admin/groups"), groupBoardResponseSchema);

  const myGroup = async (userId: string) =>
    read<MyGroupBody>(await send(userId, "GET", "/api/v1/me/group"), myGroupResponseSchema);

  const join = async (userId: string) =>
    read<MyGroupBody>(await send(userId, "POST", "/api/v1/me/group"), myGroupResponseSchema);

  const allocate = async () =>
    read<BoardBody>(
      await send(ORGANIZER, "POST", "/api/v1/admin/groups/allocate"),
      groupBoardResponseSchema,
    );

  return { clock, send, createGroup, board, myGroup, join, allocate };
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

test("pressing Allocate again places a later joiner and moves nobody already placed", async () => {
  const { clock, createGroup, join, allocate } = await harness();
  await createGroup("Mixer A");
  await createGroup("Mixer B");
  await join("user-1");
  await join("user-2");
  const first = await allocate();
  clock.advanceSeconds(30);
  await join("user-3");

  const second = await allocate();

  assert.equal(second.allocation_started_at, first.allocation_started_at);
  assert.deepEqual(second.waiting, []);
  for (const group of first.groups) {
    const after = second.groups.find(({ id }) => id === group.id)!;
    for (const member of group.members)
      assert.ok(
        after.members.some((m) => m.user_id === member.user_id && m.placed_at === member.placed_at),
      );
  }
  assert.equal(second.groups.flatMap((group) => group.members).length, 3);
});

test("Allocate with no groups places nobody and doesn't start allocation", async () => {
  const { join, allocate, myGroup } = await harness();
  await join("user-1");

  const board = await allocate();

  assert.equal(board.allocation_started_at, null);
  assert.equal(board.waiting.length, 1);
  assert.equal((await myGroup("user-1")).status, "waiting");
});
