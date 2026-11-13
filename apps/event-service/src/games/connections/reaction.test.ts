import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { answersGame } from "./answers.ts";
import { connectionsGame, type GameKind } from "./connections.ts";

/*
  The reaction test (BAC-156, agreement 0.14, 8.1 and 8.11). Alex taps Bea's
  token and Bea taps back, so each test starts with one connection made at 08:00.
*/

interface Reaction {
  play_by: string;
  your_play: string;
  your_ms: number | null;
  their_play: string;
  their_ms: number | null;
  result: string | null;
}

interface MeConnection {
  id: string;
  dice: unknown;
  reaction: Reaction | null;
}

const pickGame = vi.fn((): GameKind => "reaction");

function harness() {
  pickGame.mockReset().mockReturnValue("reaction");
  const clock = fakeClock("2026-11-12T08:00:00.000Z");
  const answers = answersGame([]);
  const app = testApp(
    {},
    {
      now: clock.now,
      answers,
      connections: connectionsGame(answers, { rollDie: () => 3, pickGame }),
    },
  );
  const cookies = new Map<string, string>();
  const signIn = async (id: string) => {
    if (cookies.has(id)) return cookies.get(id)!;
    await testDb().insert(users).values({ id, displayName: id });
    const res = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    assert.equal(res.status, 204);
    const cookie = res.headers.get("Set-Cookie")!.split(";")[0]!;
    cookies.set(id, cookie);
    return cookie;
  };
  const meOf = async (id: string) => {
    const res = await app.request("/api/v1/me", { headers: { Cookie: await signIn(id) } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { connections: MeConnection[] };
    screensSchemas.meResponseSchema.parse(body);
    return body.connections;
  };
  const meet = async (userId: string, ownerId: string) => {
    await signIn(userId);
    const kinds: Record<string, string> = { alex: "E", bea: "B", cai: "C" };
    const res = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        user_kind: kinds[userId],
        owner_id: ownerId,
        owner_kind: kinds[ownerId],
      }),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { status: string }).status;
  };
  const connect = async (a = "alex", b = "bea") => {
    assert.equal(await meet(a, b), "waiting");
    assert.equal(await meet(b, a), "connected");
    return (await meOf(a))[0]!.id;
  };
  const play = async (userId: string, connectionId: string, body: unknown) => {
    const res = await app.request(
      `/api/v1/me/connections/${encodeURIComponent(connectionId)}/reaction`,
      {
        method: "POST",
        headers: { Cookie: await signIn(userId), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const answer = (await res.json()) as { reaction?: Reaction; error?: string };
    if (res.status === 200) screensSchemas.playReactionResponseSchema.parse(answer);
    return { status: res.status, ...answer };
  };
  const reactionOf = async (id: string) => (await meOf(id))[0]!.reaction;
  return { clock, meOf, connect, play, reactionOf };
}

test("a reaction connection gives both people the same test and no dice", async () => {
  const { connect, meOf } = harness();
  await connect();
  const [alex] = await meOf("alex");
  const [bea] = await meOf("bea");
  assert.equal(alex!.id, bea!.id);
  for (const connection of [alex!, bea!]) {
    assert.equal(connection.dice, null);
    assert.deepEqual(connection.reaction, {
      play_by: "2026-11-12T08:02:00.000Z",
      your_play: "not_played",
      your_ms: null,
      their_play: "not_played",
      their_ms: null,
      result: null,
    });
  }
});

test("each person plays once, and the faster time wins once both have played", async () => {
  const { clock, connect, play, reactionOf } = harness();
  const id = await connect();
  clock.advanceSeconds(20);

  const first = await play("alex", id, { ms: 312 });
  assert.equal(first.status, 200);
  assert.deepEqual(first.reaction, {
    play_by: "2026-11-12T08:02:00.000Z",
    your_play: "played",
    your_ms: 312,
    their_play: "not_played",
    their_ms: null,
    result: null,
  });
  // Bea can see Alex has played, but not the time to beat.
  assert.deepEqual(await reactionOf("bea"), {
    play_by: "2026-11-12T08:02:00.000Z",
    your_play: "not_played",
    your_ms: null,
    their_play: "played",
    their_ms: null,
    result: null,
  });
  assert.deepEqual(await play("alex", id, { ms: 150 }), { status: 409, error: "already_played" });

  assert.deepEqual((await play("bea", id, { ms: 287 })).reaction, {
    play_by: "2026-11-12T08:02:00.000Z",
    your_play: "played",
    your_ms: 287,
    their_play: "played",
    their_ms: 312,
    result: "win",
  });
  assert.deepEqual(await reactionOf("alex"), {
    play_by: "2026-11-12T08:02:00.000Z",
    your_play: "played",
    your_ms: 312,
    their_play: "played",
    their_ms: 287,
    result: "loss",
  });
  assert.equal((await play("bea", id, { early: true })).error, "already_played");
});

test("an early tap loses to any time, and looks like a play until the result", async () => {
  const { connect, play, reactionOf } = harness();
  const id = await connect();
  assert.equal((await play("alex", id, { early: true })).reaction?.your_play, "early");
  const waiting = await reactionOf("bea");
  assert.equal(waiting?.their_play, "played");
  assert.equal(waiting?.result, null);

  await play("bea", id, { ms: 9_000 });
  assert.deepEqual(await reactionOf("alex"), {
    play_by: "2026-11-12T08:02:00.000Z",
    your_play: "early",
    your_ms: null,
    their_play: "played",
    their_ms: 9_000,
    result: "loss",
  });
  assert.equal((await reactionOf("bea"))?.their_play, "early");
  assert.equal((await reactionOf("bea"))?.result, "win");
});

test("someone who hasn't played within 2 minutes loses, and can't play after", async () => {
  const { clock, connect, play, reactionOf } = harness();
  const id = await connect();
  await play("bea", id, { ms: 400 });
  clock.advanceSeconds(119.999);
  assert.equal((await reactionOf("alex"))?.result, null);
  clock.advanceSeconds(0.001);
  assert.deepEqual(await reactionOf("alex"), {
    play_by: "2026-11-12T08:02:00.000Z",
    your_play: "missed",
    your_ms: null,
    their_play: "played",
    their_ms: 400,
    result: "loss",
  });
  assert.equal((await reactionOf("bea"))?.result, "win");
  assert.deepEqual(await play("alex", id, { ms: 100 }), { status: 409, error: "too_late" });
  // A second send from someone who played is refused for that, even after the limit.
  assert.equal((await play("bea", id, { ms: 100 })).error, "already_played");
});

test("nobody wins when neither has a time", async () => {
  const { clock, connect, play, reactionOf } = harness();
  const id = await connect();
  await play("alex", id, { early: true });
  clock.advanceSeconds(120);
  for (const [user, yours, theirs] of [
    ["alex", "early", "missed"],
    ["bea", "missed", "early"],
  ] as const) {
    const reaction = await reactionOf(user);
    assert.equal(reaction?.your_play, yours);
    assert.equal(reaction?.their_play, theirs);
    assert.equal(reaction?.result, "loss");
  }
});

test("equal times win for both", async () => {
  const { connect, play, reactionOf } = harness();
  const id = await connect();
  await play("alex", id, { ms: 250 });
  await play("bea", id, { ms: 250 });
  assert.equal((await reactionOf("alex"))?.result, "win");
  assert.equal((await reactionOf("bea"))?.result, "win");
});

test("only the two people can play, only a reaction connection, and only a valid play", async () => {
  const { connect, play, meOf } = harness();
  const id = await connect();
  assert.deepEqual(await play("cai", id, { ms: 200 }), { status: 404, error: "not_found" });
  assert.equal((await play("alex", "no-such-connection", { ms: 200 })).status, 404);
  for (const body of [
    {},
    { ms: 0 },
    { ms: 120_001 },
    { ms: 2.5 },
    { early: false },
    { ms: 200, early: true },
  ]) {
    assert.equal((await play("alex", id, body)).status, 400, JSON.stringify(body));
  }

  pickGame.mockReturnValue("dice");
  const diceId = await connect("cai", "alex");
  const [dice] = await meOf("cai");
  assert.equal(dice!.reaction, null);
  assert.deepEqual(dice!.dice, { your_roll: 3, their_roll: 3, result: "win" });
  assert.deepEqual(await play("cai", diceId, { ms: 200 }), { status: 404, error: "not_found" });
  // Nothing above was kept as a play.
  assert.equal(
    (await meOf("alex")).find(({ id: other }) => other === id)?.reaction?.your_play,
    "not_played",
  );
});

test("the service's own choice gives pairs both games, each with the same game for both people", async () => {
  const answers = answersGame([]);
  const app = testApp({}, { answers, connections: connectionsGame(answers) });
  const signIn = async (id: string) => {
    await testDb().insert(users).values({ id, displayName: id });
    const res = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    return res.headers.get("Set-Cookie")!.split(";")[0]!;
  };
  const meet = (userId: string, userKind: string, ownerId: string, ownerKind: string) =>
    app.request("/geekykey/v1/meetings", {
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
  const alex = await signIn("alex");
  // 40 pairs make the chance of only one game about 1 in 10^12.
  for (let i = 0; i < 40; i++) {
    await signIn(`p-${i}`);
    await meet("alex", "E", `p-${i}`, "B");
    assert.equal(
      ((await (await meet(`p-${i}`, "B", "alex", "E")).json()) as { status: string }).status,
      "connected",
    );
  }
  const body = (await (await app.request("/api/v1/me", { headers: { Cookie: alex } })).json()) as {
    connections: MeConnection[];
  };
  screensSchemas.meResponseSchema.parse(body);
  const games = body.connections.map((connection) => {
    // Exactly one of the two games per connection.
    assert.ok((connection.dice === null) !== (connection.reaction === null));
    return connection.dice === null ? "reaction" : "dice";
  });
  assert.deepEqual([...new Set(games)].sort(), ["dice", "reaction"]);
});
