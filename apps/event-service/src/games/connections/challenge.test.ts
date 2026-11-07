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
import { connectionsGame, type GameKind } from "./connections.ts";

// Which challenge a new connection plays (BAC-161, draft for the API agreement's next version):
// organizers choose on the Groups screen between Random, as it has always been, Dice and
// Reaction. The choice applies to connections made after it.

const ORGANIZER = "dev-organizer-1";

const { groupBoardResponseSchema, meResponseSchema, connectionChallengeSchema } = screensSchemas;

type Challenge = "random" | "dice" | "reaction";

/** A connection as /me lists it, with only what this file looks at. */
interface ConnectionBody {
  display_name: string;
  dice: unknown;
  reaction: unknown;
}

/**
 * The Event Service with a connections game whose coin for Random gives `coin`'s answers in
 * turn, so a test knows what Random picks.
 */
async function harness(coin: GameKind[] = ["reaction"]) {
  const clock = fakeClock("2026-11-12T09:00:00.000Z");
  let flips = 0;
  const app = testApp(
    {},
    {
      now: clock.now,
      connections: connectionsGame(null, {
        rollDie: () => 5,
        pickGame: () => coin[flips++ % coin.length]!,
      }),
    },
  );
  await testDb()
    .insert(users)
    .values([ORGANIZER, "alex", "bea", "chen", "dewi"].map((id) => ({ id, displayName: id })));

  /** Sends a request as `userId`, signed in through dev-login, or with no session when null. */
  const send = async (
    userId: string | null,
    method: "GET" | "PUT",
    path: string,
    body?: unknown,
  ) => {
    let cookie: string | null = null;
    if (userId !== null) {
      const login = await app.request("/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      assert.equal(login.status, 204);
      cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    }
    return app.request(path, {
      method,
      headers: {
        ...(cookie === null ? {} : { Cookie: cookie }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };

  /** The organizers' board, read as the Groups screen reads it. */
  const board = async () => {
    const response = await send(ORGANIZER, "GET", "/api/v1/admin/groups");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    groupBoardResponseSchema.parse(body);
    return body as { challenge: Challenge; connect_across: string };
  };

  /** The Groups screen's choice, which must answer 200 with the new setting. */
  const choose = async (challenge: Challenge) => {
    const response = await send(ORGANIZER, "PUT", "/api/v1/admin/connections/challenge", {
      challenge,
    });
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    connectionChallengeSchema.parse(body);
    assert.deepEqual(body, { challenge });
  };

  /** One half: `userId` tapped the token of `ownerId`, as the GeekyKey Service hands it on. */
  const meet = async (userId: string, ownerId: string) => {
    const response = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        user_kind: KINDS[userId],
        owner_id: ownerId,
        owner_kind: KINDS[ownerId],
      }),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { status: string }).status;
  };

  /** Connects two people of different kinds, a tap each way. */
  const connect = async (one: string, other: string) => {
    assert.equal(await meet(one, other), "waiting");
    clock.advanceSeconds(10);
    assert.equal(await meet(other, one), "connected");
  };

  /** What each of the user's connections plays, by the other person's name, from /me. */
  const challengesOf = async (userId: string) => {
    const response = await send(userId, "GET", "/api/v1/me");
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    meResponseSchema.parse(body);
    const { connections } = body as { connections: ConnectionBody[] };
    return Object.fromEntries(
      connections.map(({ display_name, dice, reaction }) => [
        display_name,
        dice !== null ? "dice" : reaction !== null ? "reaction" : "none",
      ]),
    );
  };

  return { send, board, choose, connect, challengesOf };
}

/** Each test user's token kind, so any two of them may connect across token kinds. */
const KINDS: Record<string, string> = { alex: "A", bea: "B", chen: "C", dewi: "D" };

test("on Dice every new connection rolls, whatever Random's coin would say", async () => {
  const { choose, connect, challengesOf } = await harness(["reaction"]);
  await choose("dice");

  await connect("alex", "bea");
  await connect("alex", "chen");
  assert.deepEqual(await challengesOf("alex"), { bea: "dice", chen: "dice" });
});

test("a new event picks at random, and the board shows each choice", async () => {
  const { board, choose } = await harness();
  assert.equal((await board()).challenge, "random");

  await choose("reaction");
  assert.equal((await board()).challenge, "reaction");
  await choose("random");
  assert.equal((await board()).challenge, "random");
});

test("on Reaction every new connection plays the reaction test, whatever the coin would say", async () => {
  const { choose, connect, challengesOf } = await harness(["dice"]);
  await choose("reaction");

  await connect("alex", "bea");
  await connect("alex", "chen");
  assert.deepEqual(await challengesOf("alex"), { bea: "reaction", chen: "reaction" });
});

test("on Random each new connection plays what the coin gives", async () => {
  const { connect, challengesOf } = await harness(["dice", "reaction"]);

  await connect("alex", "bea");
  await connect("alex", "chen");
  assert.deepEqual(await challengesOf("alex"), { bea: "dice", chen: "reaction" });
});

test("connections already made keep their challenge when the setting changes", async () => {
  const { choose, connect, challengesOf } = await harness(["reaction"]);
  await choose("dice");
  await connect("alex", "bea");

  await choose("reaction");
  await connect("alex", "chen");
  await choose("random");
  await connect("alex", "dewi");

  assert.deepEqual(await challengesOf("alex"), { bea: "dice", chen: "reaction", dewi: "reaction" });
  assert.deepEqual(await challengesOf("bea"), { alex: "dice" });
});

test("only organizers read or change the setting, to one of its three values", async () => {
  const { send, board } = await harness();
  const challenge = (userId: string | null, body: unknown) =>
    send(userId, "PUT", "/api/v1/admin/connections/challenge", body);

  assert.equal((await challenge(null, { challenge: "dice" })).status, 401);
  assert.equal((await challenge("alex", { challenge: "dice" })).status, 403);
  assert.equal((await send("alex", "GET", "/api/v1/admin/groups")).status, 403);
  for (const body of [{ challenge: "coin" }, { challenge: null }, {}]) {
    const refused = await challenge(ORGANIZER, body);
    assert.equal(refused.status, 400);
    assert.equal(((await refused.json()) as { error: string }).error, "validation_failed");
  }
  assert.equal((await board()).challenge, "random");
});

test("choosing a challenge leaves the connection rule as it was, and the other way round", async () => {
  const { send, board, choose } = await harness();
  assert.equal(
    (await send(ORGANIZER, "PUT", "/api/v1/admin/connections/rule", { connect_across: "groups" }))
      .status,
    200,
  );
  await choose("dice");
  assert.deepEqual(
    await board().then(({ challenge, connect_across }) => ({ challenge, connect_across })),
    { challenge: "dice", connect_across: "groups" },
  );

  assert.equal(
    (
      await send(ORGANIZER, "PUT", "/api/v1/admin/connections/rule", {
        connect_across: "token_kinds",
      })
    ).status,
    200,
  );
  assert.equal((await board()).challenge, "dice");
});
