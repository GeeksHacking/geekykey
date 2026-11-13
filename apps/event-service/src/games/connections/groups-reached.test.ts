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

// Each group sees which other groups it has connected with (BAC-167, agreement 0.14).
// A group has reached another when one of its members has an accepted connection
// with a member of that group, by the groups as they are now. A participant's card shows it for
// their own group, by names only, and the organizers' board shows it for every group.

const ORGANIZER = "dev-organizer-1";

const { groupBoardResponseSchema, eventGroupSchema, myGroupResponseSchema, meResponseSchema } =
  screensSchemas;

/** Nine participants, three to a group in most tests. */
const PEOPLE = ["ann", "ben", "cat", "dan", "eve", "fay", "gus", "hal", "ivy"] as const;

type Person = (typeof PEOPLE)[number];

/** Each other group as a participant's card lists it. */
interface OtherGroup {
  name: string;
  reached: boolean;
}

/** GET /api/v1/me/group, as far as these tests read it. */
interface MyGroupBody {
  status: "not_joined" | "waiting" | "placed";
  group: { name: string; other_groups: OtherGroup[] } | null;
}

/** GET /api/v1/admin/groups, as far as these tests read it. */
interface BoardBody {
  groups: { id: string; name: string; reached_group_ids: string[] }[];
}

/** The Event Service with a connections game and no answers game. */
async function harness() {
  const clock = fakeClock("2026-11-14T09:00:00.000Z");
  const app = testApp(
    {},
    {
      now: clock.now,
      connections: connectionsGame(null, { rollDie: () => 4, pickGame: () => "dice" }),
    },
  );
  await testDb()
    .insert(users)
    .values([ORGANIZER, ...PEOPLE].map((id) => ({ id, displayName: id })));

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

  /** Makes a group for each name, in order, with the people given for it, and gives their IDs. */
  const makeGroups = async (groups: Record<string, readonly Person[]>) => {
    const ids: Record<string, string> = {};
    for (const [name, people] of Object.entries(groups)) {
      ids[name] = await createGroup(name);
      // A second apart, so the groups are listed in the order made.
      clock.advanceSeconds(1);
      for (const person of people) await place(person, ids[name]);
    }
    return ids;
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
  };

  /** The participant's card, which the Event screens must accept. */
  const myGroup = async (userId: string) => {
    const response = await send(userId, "GET", "/api/v1/me/group");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    myGroupResponseSchema.parse(body);
    return body as MyGroupBody;
  };

  /** The other groups `userId`'s card lists, as name and whether reached. */
  const othersOf = async (userId: Person) => (await myGroup(userId)).group?.other_groups;

  /** The organizers' board, which the Groups screen must accept. */
  const board = async () => {
    const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    groupBoardResponseSchema.parse(body);
    return body as BoardBody;
  };

  /** Each group's name on the board, with the names of the groups it has reached. */
  const reachedOnBoard = async () => {
    const { groups } = await board();
    const nameOf = new Map(groups.map(({ id, name }) => [id, name]));
    return Object.fromEntries(
      groups.map(({ name, reached_group_ids }) => [
        name,
        reached_group_ids.map((id) => nameOf.get(id)),
      ]),
    );
  };

  /** /me, which the Event screens must accept, for its waiting requests. */
  const requestsOf = async (userId: Person) => {
    const response = await send(userId, "GET", "/api/v1/me");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    meResponseSchema.parse(body);
    return (body as { connection_requests: { id: string }[] }).connection_requests;
  };

  return {
    clock,
    send,
    createGroup,
    place,
    makeGroups,
    meet,
    connect,
    myGroup,
    othersOf,
    board,
    reachedOnBoard,
    requestsOf,
  };
}

const THREE_GROUPS = {
  Red: ["ann", "ben", "cat"],
  Blue: ["dan", "eve", "fay"],
  Green: ["gus", "hal", "ivy"],
} as const;

test("with 3 groups of 3, a group shows both others as reached once it has a connection with each", async () => {
  const { makeGroups, connect, othersOf, reachedOnBoard } = await harness();
  await makeGroups(THREE_GROUPS);

  assert.deepEqual(await othersOf("ann"), [
    { name: "Blue", reached: false },
    { name: "Green", reached: false },
  ]);

  await connect("ann", "dan");
  // Every member of a group sees what any of them reached, and so does the group reached.
  for (const redMember of ["ann", "ben", "cat"] as const) {
    assert.deepEqual(await othersOf(redMember), [
      { name: "Blue", reached: true },
      { name: "Green", reached: false },
    ]);
  }
  assert.deepEqual(await othersOf("fay"), [
    { name: "Red", reached: true },
    { name: "Green", reached: false },
  ]);
  assert.deepEqual(await othersOf("ivy"), [
    { name: "Red", reached: false },
    { name: "Blue", reached: false },
  ]);

  await connect("hal", "cat");
  assert.deepEqual(await othersOf("ben"), [
    { name: "Blue", reached: true },
    { name: "Green", reached: true },
  ]);
  assert.deepEqual(await reachedOnBoard(), {
    Red: ["Blue", "Green"],
    Blue: ["Red"],
    Green: ["Red"],
  });
});

test("a waiting request reaches nothing, and nor does a declined one", async () => {
  const { makeGroups, meet, send, requestsOf, othersOf, reachedOnBoard } = await harness();
  await makeGroups(THREE_GROUPS);

  // Ann's request waits for Dan, and Gus's for Cat until Cat declines it.
  assert.equal(await meet("ann", "dan"), "waiting");
  assert.equal(await meet("gus", "cat"), "waiting");
  const [request] = await requestsOf("cat");
  const declined = await send(
    "cat",
    "POST",
    `/api/v1/me/connection-requests/${request!.id}/decline`,
  );
  assert.equal(declined.status, 204);

  assert.deepEqual(await othersOf("ann"), [
    { name: "Blue", reached: false },
    { name: "Green", reached: false },
  ]);
  assert.deepEqual(await othersOf("gus"), [
    { name: "Red", reached: false },
    { name: "Blue", reached: false },
  ]);
  assert.deepEqual(await reachedOnBoard(), { Red: [], Blue: [], Green: [] });
});

test("what a group has reached follows the groups as they are now, through a move and a second grouping", async () => {
  const { send, makeGroups, place, connect, othersOf, reachedOnBoard, myGroup } = await harness();
  const ids = await makeGroups(THREE_GROUPS);
  await connect("ann", "dan");

  // Dan moves to Green, taking the connection with him.
  await place("dan", ids.Green!);
  assert.deepEqual(await othersOf("ben"), [
    { name: "Blue", reached: false },
    { name: "Green", reached: true },
  ]);
  assert.deepEqual(await reachedOnBoard(), { Red: ["Green"], Blue: [], Green: ["Red"] });

  // After Reset nobody is in a group, so nobody's card shows any.
  const reset = await send(ORGANIZER, "POST", "/api/v1/admin/groups/reset");
  assert.equal(reset.status, 200);
  assert.equal((await myGroup("ann")).group, null);
  assert.deepEqual(await reachedOnBoard(), { Red: [], Blue: [], Green: [] });

  // In the second grouping Ann and Dan share a group, and a connection inside a group reaches
  // no other. Green has nobody in it, so it isn't on the card to reach.
  for (const person of ["ann", "dan"] as const) await place(person, ids.Red!);
  for (const person of ["eve", "fay"] as const) await place(person, ids.Blue!);
  assert.deepEqual(await othersOf("ann"), [{ name: "Blue", reached: false }]);
  assert.deepEqual(await reachedOnBoard(), { Red: [], Blue: [], Green: [] });
});

test("a group with nobody in it isn't listed, so a group can still reach every other", async () => {
  const { makeGroups, connect, othersOf } = await harness();
  await makeGroups({ Red: ["ann", "ben"], Blue: ["dan", "eve"], Spare: [] });

  assert.deepEqual(await othersOf("ann"), [{ name: "Blue", reached: false }]);
  await connect("ben", "eve");
  assert.deepEqual(await othersOf("ann"), [{ name: "Blue", reached: true }]);
});

test("someone not in a group sees no groups and reaches none, and one group has none to reach", async () => {
  const { makeGroups, place, connect, myGroup, othersOf, reachedOnBoard } = await harness();
  await makeGroups({ Red: ["ann", "ben"] });
  // Ivy waits, and Hal hasn't joined.
  await place("ivy", null);
  await connect("ann", "ivy");
  await connect("ben", "hal");

  assert.deepEqual(await myGroup("ivy"), {
    status: "waiting",
    allocation_started: false,
    group: null,
  });
  assert.equal((await myGroup("hal")).status, "not_joined");
  assert.equal((await myGroup("hal")).group, null);
  assert.deepEqual(await othersOf("ann"), []);
  assert.deepEqual(await reachedOnBoard(), { Red: [] });
});
