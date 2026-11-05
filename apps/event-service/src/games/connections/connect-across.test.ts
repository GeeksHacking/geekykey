import assert from "node:assert/strict";
import { test } from "vitest";
import { users } from "../../event/schema.ts";
import {
  anotherTestDb,
  fakeClock,
  screensSchemas,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { connectionsGame } from "./connections.ts";

// Who may connect (BAC-140, draft for the API agreement's next version): organizers choose
// on the Groups screen whether a connection needs two people of different token kinds, as it
// always has, or two people placed in different groups, whatever their tokens' kinds.

const ORGANIZER = "dev-organizer-1";

const { groupBoardResponseSchema, eventGroupSchema, meResponseSchema, connectionRuleSchema } =
  screensSchemas;

type ConnectAcross = "token_kinds" | "groups";

/** A connection as /me lists it. */
interface ConnectionBody {
  connected_at: string;
  kind: string | null;
}

/** A second instance of the service, with its own connections, made once for the file. */
let secondInstanceDb: ReturnType<typeof anotherTestDb> | undefined;

/** The Event Service with a connections game and no answers game, on a clock the test moves. */
async function harness() {
  const clock = fakeClock("2026-11-05T09:00:00.000Z");
  const app = testApp({}, { now: clock.now, connections: connectionsGame(null) });
  await testDb()
    .insert(users)
    .values([ORGANIZER, "alex", "bea", "chen", "dewi"].map((id) => ({ id, displayName: id })));

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

  /** Sends a request as `userId`, or with no session when it's null. */
  const send = async (
    userId: string | null,
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    on = app,
  ) =>
    on.request(path, {
      method,
      headers: {
        ...(userId === null ? {} : { Cookie: await signIn(userId, on) }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  /** The organizers' board, read as the Groups screen reads it. */
  const board = async (on = app) => {
    const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups", undefined, on);
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    groupBoardResponseSchema.parse(body);
    return body as { connect_across: ConnectAcross };
  };

  /** The Groups screen's switch, which must answer 200 with the new setting. */
  const connectAcross = async (value: ConnectAcross, on = app) => {
    const response = await send(
      ORGANIZER,
      "PUT",
      "/api/v1/admin/connections/rule",
      { connect_across: value },
      on,
    );
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    connectionRuleSchema.parse(body);
    assert.deepEqual(body, { connect_across: value });
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
  const place = async (userId: string, groupId: string | null) => {
    const response = await send(ORGANIZER, "PUT", `/api/v1/admin/groups/members/${userId}`, {
      group_id: groupId,
    });
    assert.equal(response.status, 200);
  };

  /** One half: `userId` tapped the token of `ownerId`, as the GeekyKey Service hands it on. */
  const meet = async (
    userId: string,
    userKind: string | null,
    ownerId: string,
    ownerKind: string | null,
  ) => {
    const response = await app.request("/geekykey/v1/meetings", {
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
    assert.equal(response.status, 200);
    return ((await response.json()) as { status: string }).status;
  };

  /** The user's connections in /me, which the Event screens must accept. */
  const connectionsOf = async (userId: string) => {
    const response = await send(userId, "GET", "/api/v1/me");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    meResponseSchema.parse(body);
    return (body as { connections: ConnectionBody[] }).connections;
  };

  return { app, clock, send, board, connectAcross, createGroup, place, meet, connectionsOf };
}

test("a new event connects across token kinds", async () => {
  const { board } = await harness();
  assert.equal((await board()).connect_across, "token_kinds");
});

test("across groups, two people in different groups connect whatever their kinds, even none", async () => {
  const { clock, connectAcross, createGroup, place, meet, connectionsOf } = await harness();
  const [red, blue] = [await createGroup("Red"), await createGroup("Blue")];
  await place("alex", red);
  await place("bea", blue);
  await place("chen", red);
  await place("dewi", blue);
  await connectAcross("groups");

  // Two tokens with no kind, then two of one kind.
  assert.equal(await meet("alex", null, "bea", null), "waiting");
  clock.advanceSeconds(20);
  assert.equal(await meet("bea", null, "alex", null), "connected");
  assert.equal(await meet("chen", "E", "dewi", "E"), "waiting");
  assert.equal(await meet("dewi", "E", "chen", "E"), "connected");

  // The passport lists each without a kind, or with the other person's.
  assert.deepEqual(await connectionsOf("alex"), [
    {
      connected_at: "2026-11-05T09:00:20.000Z",
      kind: null,
      match: null,
      shared: null,
      shared_at: "2026-11-05T09:02:20.000Z",
    },
  ]);
  assert.deepEqual(
    (await connectionsOf("chen")).map(({ kind }) => kind),
    ["E"],
  );
});

test("across groups, two people in one group get same_kind, as the token page's same group", async () => {
  const { connectAcross, createGroup, place, meet, connectionsOf } = await harness();
  const red = await createGroup("Red");
  await place("alex", red);
  await place("bea", red);
  await connectAcross("groups");

  // Their kinds differ, and still don't connect them.
  assert.equal(await meet("alex", "E", "bea", "B"), "same_kind");
  assert.equal(await meet("bea", "B", "alex", "E"), "same_kind");
  assert.deepEqual(await connectionsOf("alex"), []);
});

test("across groups, someone not in a group gets no_group, and no half is kept", async () => {
  const { clock, connectAcross, createGroup, place, meet, connectionsOf } = await harness();
  const [red, blue] = [await createGroup("Red"), await createGroup("Blue")];
  await place("alex", red);
  await place("bea", null); // joined, and waiting
  await connectAcross("groups");

  // Waiting, and never joined, from either side of the tap.
  assert.equal(await meet("alex", "E", "bea", "B"), "no_group");
  assert.equal(await meet("bea", "B", "alex", "E"), "no_group");
  assert.equal(await meet("chen", "E", "alex", "B"), "no_group");
  assert.deepEqual(await connectionsOf("alex"), []);

  // Placed a moment later, Bea's half back finds none of Alex's to meet.
  await place("bea", blue);
  clock.advanceSeconds(10);
  assert.equal(await meet("bea", "B", "alex", "E"), "waiting");
});

test("each tap is judged by the setting and the groups at that tap", async () => {
  const { clock, connectAcross, createGroup, place, meet, connectionsOf } = await harness();
  const [red, blue] = [await createGroup("Red"), await createGroup("Blue")];
  await place("alex", red);
  await place("bea", blue);
  await connectAcross("groups");

  // Bea moves into Alex's group between the two halves.
  assert.equal(await meet("alex", "E", "bea", "E"), "waiting");
  await place("bea", red);
  clock.advanceSeconds(10);
  assert.equal(await meet("bea", "E", "alex", "E"), "same_kind");

  // Back across token kinds, their one kind keeps them apart, whatever their groups.
  await place("bea", blue);
  await connectAcross("token_kinds");
  assert.equal(await meet("bea", "E", "alex", "E"), "same_kind");

  // And two kinds connect them, though Chen has no group at all.
  assert.equal(await meet("chen", "B", "alex", "E"), "waiting");
  assert.equal(await meet("alex", "E", "chen", "B"), "connected");
  assert.deepEqual(
    (await connectionsOf("alex")).map(({ kind }) => kind),
    ["B"],
  );
});

test("connections stay when the setting changes, someone moves group, and after a Reset", async () => {
  const { send, connectAcross, createGroup, place, meet, connectionsOf } = await harness();
  const [red, blue] = [await createGroup("Red"), await createGroup("Blue")];
  await place("alex", red);
  await place("bea", blue);
  await connectAcross("groups");
  assert.equal(await meet("alex", null, "bea", null), "waiting");
  assert.equal(await meet("bea", null, "alex", null), "connected");

  await place("bea", red);
  await connectAcross("token_kinds");
  assert.equal((await send(ORGANIZER, "POST", "/api/v1/admin/groups/reset")).status, 200);

  assert.equal((await connectionsOf("alex")).length, 1);
  assert.equal((await connectionsOf("bea")).length, 1);
  // A pair connects once, whatever the setting says now.
  assert.equal(await meet("alex", "E", "bea", "B"), "already_connected");
});

test("only organizers change the setting, to one of its two values", async () => {
  const { send, board } = await harness();
  const rule = (userId: string | null, body: unknown) =>
    send(userId, "PUT", "/api/v1/admin/connections/rule", body);

  assert.equal((await rule(null, { connect_across: "groups" })).status, 401);
  assert.equal((await rule("alex", { connect_across: "groups" })).status, 403);
  const refused = await rule(ORGANIZER, { connect_across: "houses" });
  assert.equal(refused.status, 400);
  assert.equal(((await refused.json()) as { error: string }).error, "validation_failed");
  assert.equal((await board()).connect_across, "token_kinds");
});

test("the setting holds across a restart and on another instance", async () => {
  const { app, connectAcross, board } = await harness();
  await connectAcross("groups");

  const restarted = testApp({}, { connections: connectionsGame(null) });
  secondInstanceDb ??= anotherTestDb();
  const other = testApp({}, { connections: connectionsGame(null), db: secondInstanceDb });
  assert.equal((await board(restarted)).connect_across, "groups");
  assert.equal((await board(other)).connect_across, "groups");

  // Switched back on the other, the first sees it too.
  await connectAcross("token_kinds", other);
  assert.equal((await board(app)).connect_across, "token_kinds");
});
