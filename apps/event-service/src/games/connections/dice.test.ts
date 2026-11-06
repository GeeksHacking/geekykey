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
import { connectionsGame } from "./connections.ts";
import { connections } from "./schema.ts";

const rollDie = vi.fn(() => 1);

function harness(realDice = false) {
  rollDie.mockReset().mockReturnValue(1);
  const clock = fakeClock("2026-11-12T08:00:00.000Z");
  const answers = answersGame([]);
  const app = testApp(
    {},
    {
      now: clock.now,
      answers,
      connections: connectionsGame(
        answers,
        realDice ? { pickGame: () => "dice" } : { rollDie, pickGame: () => "dice" },
      ),
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
    const body = await res.json();
    const parsed = screensSchemas.meResponseSchema.parse(body) as {
      connections: { dice: unknown }[];
    };
    assert.deepEqual(
      parsed.connections.map(({ dice }) => dice),
      (body as { connections: { dice: unknown }[] }).connections.map(({ dice }) => dice),
    );
    return body as {
      connection_requests: { id: string }[];
      connections: { dice?: { your_roll: number; their_roll: number; result: string } | null }[];
    };
  };
  const tap = async (back = false, other = "bea") => {
    await signIn(back ? other : "alex");
    const res = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        back
          ? { user_id: other, user_kind: "B", owner_id: "alex", owner_kind: "E" }
          : { user_id: "alex", user_kind: "E", owner_id: other, owner_kind: "B" },
      ),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { status: string }).status;
  };
  const accept = async (requestId: string) => {
    const res = await app.request(`/api/v1/me/connection-requests/${requestId}/accept`, {
      method: "POST",
      headers: { Cookie: await signIn("bea") },
    });
    assert.equal(res.status, 200);
    screensSchemas.acceptConnectionRequestResponseSchema.parse(await res.json());
  };
  return { clock, tap, meOf, accept };
}

test("the service's real dice give every integer from 1 to 6 and nothing else", async () => {
  const { tap, meOf } = harness(true);
  // 192 real rolls make the chance of missing any valid face less than 1 in 10^14.
  // Checking the whole set catches an exclusive upper bound that accidentally leaves out 6.
  for (let i = 0; i < 96; i++) {
    const other = `participant-${i}`;
    assert.equal(await tap(false, other), "waiting");
    assert.equal(await tap(true, other), "connected");
  }
  const { connections } = await meOf("alex");
  assert.equal(connections.length, 96);
  const rolls = connections.flatMap(({ dice }) => {
    assert.ok(dice);
    return [dice.your_roll, dice.their_roll];
  });
  assert.deepEqual([...new Set(rolls)].sort(), [1, 2, 3, 4, 5, 6]);
});

test("accepting gives both people the same dice, with the higher roll winning", async () => {
  const { tap, meOf, accept } = harness();
  await tap();
  const [request] = (await meOf("bea")).connection_requests;
  rollDie.mockReturnValueOnce(6).mockReturnValueOnce(1);
  await accept(request!.id);
  assert.deepEqual((await meOf("alex")).connections[0]?.dice, {
    your_roll: 6,
    their_roll: 1,
    result: "win",
  });
  assert.deepEqual((await meOf("bea")).connections[0]?.dice, {
    your_roll: 1,
    their_roll: 6,
    result: "loss",
  });
});

test("equal rolls give both people a win", async () => {
  const { tap, meOf, accept } = harness();
  await tap();
  const [request] = (await meOf("bea")).connection_requests;
  rollDie.mockReturnValue(3);
  await accept(request!.id);
  for (const id of ["alex", "bea"]) {
    assert.deepEqual((await meOf(id)).connections[0]?.dice, {
      your_roll: 3,
      their_roll: 3,
      result: "win",
    });
  }
});

test("tapping back rolls once and later polls and taps keep both people's dice", async () => {
  const { clock, tap, meOf } = harness();
  await tap();
  rollDie.mockReturnValueOnce(2).mockReturnValueOnce(5);
  assert.equal(await tap(true), "connected");
  const alex = await meOf("alex");
  const bea = await meOf("bea");
  assert.deepEqual(alex.connections[0]?.dice, { your_roll: 2, their_roll: 5, result: "loss" });
  assert.deepEqual(bea.connections[0]?.dice, { your_roll: 5, their_roll: 2, result: "win" });
  rollDie.mockReturnValue(6);
  clock.advanceSeconds(300);
  assert.equal(await tap(), "already_connected");
  assert.equal(await tap(true), "already_connected");
  assert.deepEqual(
    (await meOf("alex")).connections.map(({ dice }) => dice),
    alex.connections.map(({ dice }) => dice),
  );
  assert.deepEqual(
    (await meOf("bea")).connections.map(({ dice }) => dice),
    bea.connections.map(({ dice }) => dice),
  );
});

test("two accepts at once keep one connection and one set of dice", async () => {
  const { tap, meOf, accept } = harness();
  await tap();
  const [request] = (await meOf("bea")).connection_requests;
  rollDie.mockReturnValueOnce(4).mockReturnValueOnce(6);
  await Promise.all([accept(request!.id), accept(request!.id)]);
  const alex = await meOf("alex");
  const bea = await meOf("bea");
  assert.equal(alex.connections.length, 1);
  assert.equal(bea.connections.length, 1);
  assert.deepEqual(alex.connections[0]?.dice, { your_roll: 4, their_roll: 6, result: "loss" });
  assert.deepEqual(bea.connections[0]?.dice, { your_roll: 6, their_roll: 4, result: "win" });
});

test("a connection from before dice has no rolls, even after another tap", async () => {
  const { clock, tap, meOf } = harness();
  // A connection stored by the previous service, which didn't write roll columns.
  await testDb().insert(connections).values({
    userA: "alex",
    userB: "bea",
    kindA: "E",
    kindB: "B",
    connectedAt: clock.now().toISOString(),
    matchPercent: null,
    shared: [],
  });
  assert.equal(await tap(), "already_connected");
  for (const id of ["alex", "bea"]) {
    assert.equal((await meOf(id)).connections[0]?.dice, null);
  }
});
