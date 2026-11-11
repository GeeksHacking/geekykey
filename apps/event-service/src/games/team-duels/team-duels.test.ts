import assert from "node:assert/strict";
import { test } from "vitest";
import { eq } from "drizzle-orm";
import { groupMembers, participantGroups, stations, users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  setupFixture,
  testApp,
  testDb,
  TEST_EVENT_SERVICE_KEY,
} from "../../test-helpers.ts";
import { connectionsGame } from "../connections/connections.ts";
import { duelRoundPlayers, duelRounds } from "./schema.ts";
import { teamDuelsGame } from "./team-duels.ts";
import type { Round } from "../../event/team-duels.ts";

async function harness(challenge: "dice" | "reaction" = "dice", rollDie = () => 3) {
  const fixture = await setupFixture();
  await testDb()
    .update(stations)
    .set({ game: "team_duels" })
    .where(eq(stations.id, fixture.stationId));
  const clock = fakeClock("2026-11-12T08:00:00.000Z");
  const app = testApp(
    { ORGANIZERS: "organizer" },
    {
      now: clock.now,
      teamDuels: teamDuelsGame({ shuffle: (xs) => xs, rollDie, pickGame: () => challenge }),
    },
  );
  const cookies = new Map<string, string>();
  async function cookie(id: string) {
    if (!cookies.has(id)) {
      if (id !== fixture.userId)
        await testDb()
          .insert(users)
          .values({ id, displayName: id })
          .onDuplicateKeyUpdate({ set: { displayName: id } });
      const res = await app.request("/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      });
      cookies.set(id, res.headers.get("Set-Cookie")!.split(";")[0]!);
    }
    return cookies.get(id)!;
  }
  async function me(id: string) {
    const res = await app.request("/api/v1/me", { headers: { Cookie: await cookie(id) } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      round: Round | null;
      round_wins: number;
      connections: unknown[];
    };
    screensSchemas.meResponseSchema.parse(body);
    return body;
  }
  async function tap(id: string, tappedAt: string | null = null, login = true) {
    if (login) await cookie(id);
    const res = await app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: fixture.stationId,
        taps: [{ client_tap_id: crypto.randomUUID(), user_id: id, tapped_at: tappedAt }],
      }),
    });
    assert.equal(res.status, 200);
    const { status, lines } = (
      (await res.json()) as { results: { status: string; lines?: string[] }[] }
    ).results[0]!;
    return { status, lines };
  }
  async function play(id: string, duel: string, body: unknown) {
    const response = await app.request(`/api/v1/me/duels/${duel}/reaction`, {
      method: "POST",
      headers: { Cookie: await cookie(id), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) screensSchemas.playReactionResponseSchema.parse(await response.clone().json());
    return response;
  }
  return { app, clock, me, tap, play, cookie, stationId: fixture.stationId };
}

test("two taps join one round and equal dice win the round for both teams without connecting", async () => {
  const h = await harness();
  assert.equal((await h.tap("alex")).status, "accepted");
  const opening = (await h.me("alex")).round!;
  assert.equal(opening.state, "opening");
  assert.equal((await h.tap("bea")).status, "accepted");
  h.clock.advanceSeconds(30);
  const [a, b] = await Promise.all([h.me("alex"), h.me("bea")]);
  assert.equal(a.round!.id, opening.id);
  assert.equal(b.round!.id, opening.id);
  assert.notEqual(a.round!.team, b.round!.team);
  assert.equal(a.round!.duels[0]!.opponent, "bea");
  assert.equal(b.round!.duels[0]!.opponent, "alex");
  assert.equal(a.round!.state, "ended");
  assert.equal(a.round_wins, 1);
  assert.equal(b.round_wins, 1);
  assert.deepEqual(a.connections, []);
});

test("a lone player ends without a team or a round win", async () => {
  const h = await harness();
  const tap = await h.tap("alex");
  assert.deepEqual(tap.lines, ["alex joined", "1 in, 30s left"]);
  h.clock.advanceSeconds(30);
  const me = await h.me("alex");
  assert.equal(me.round!.state, "ended");
  assert.equal(me.round!.team, null);
  assert.deepEqual(me.round!.duels, []);
  assert.deepEqual(me.round!.result, {
    outcome: "nobody_joined",
    your_team_wins: 0,
    their_team_wins: 0,
  });
  assert.equal(me.round_wins, 0);
});

test("a repeated tap is held back during opening and play without adding a player", async () => {
  const h = await harness("reaction");
  await h.tap("alex");
  assert.deepEqual(await h.tap("alex"), {
    status: "cooldown",
    lines: ["Already in", "1 in, 30s left"],
  });
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  assert.deepEqual(await h.tap("alex"), {
    status: "cooldown",
    lines: ["Already in", "Still playing"],
  });
  assert.equal((await h.me("alex")).round!.players, 2);
});

test("an odd round gives one smaller-team player two opponents and both teammates by name", async () => {
  const h = await harness();
  for (const id of ["alex", "bea", "cai"]) await h.tap(id);
  h.clock.advanceSeconds(30);
  const rounds = await Promise.all(
    ["alex", "bea", "cai"].map(async (id) => (await h.me(id)).round!),
  );
  assert.deepEqual(rounds.map((r) => r.duels.length).sort(), [1, 1, 2]);
  const smaller = rounds.find((r) => r.duels.length === 2)!;
  assert.deepEqual(smaller.teammates, []);
  assert.equal(new Set(smaller.duels.map((d) => d.opponent)).size, 2);
  for (const round of rounds.filter((r) => r.duels.length === 1))
    assert.equal(round.teammates.length, 1);
});

test("each group's players are spread evenly and all opponents come from different groups when possible", async () => {
  const h = await harness();
  const ids = ["alex", "bea", "cai", "dee", "eli", "flo"];
  for (const id of ids) await h.tap(id);
  for (const [i, members] of [
    ["alex", "bea", "cai"],
    ["dee", "eli", "flo"],
  ].entries()) {
    await testDb()
      .insert(participantGroups)
      .values({
        id: `g${i}`,
        name: `Group ${i}`,
        tags: [],
        createdAt: h.clock.now().toISOString(),
      });
    await testDb()
      .insert(groupMembers)
      .values(
        members.map((userId) => ({
          userId,
          groupId: `g${i}`,
          joinedAt: h.clock.now().toISOString(),
        })),
      );
  }
  h.clock.advanceSeconds(30);
  const rounds = await Promise.all(ids.map(async (id) => (await h.me(id)).round!));
  for (const indexes of [
    [0, 1, 2],
    [3, 4, 5],
  ]) {
    const a = indexes.filter((i) => rounds[i]!.team === "a").length;
    assert.ok(a === 1 || a === 2);
  }
  for (const [i, round] of rounds.entries()) {
    assert.equal(round.teammates.length, 2);
    assert.equal(ids.indexOf(round.duels[0]!.opponent) < 3, i >= 3);
  }
});

test("unequal dice give only the higher-scoring team a round win", async () => {
  let roll = 0;
  const h = await harness("dice", () => (++roll % 2 === 1 ? 6 : 1));
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const a = await h.me("alex"),
    b = await h.me("bea");
  assert.equal(a.round!.duels[0]!.dice!.result, "win");
  assert.equal(b.round!.duels[0]!.dice!.result, "loss");
  assert.deepEqual(a.round!.result, { outcome: "win", your_team_wins: 1, their_team_wins: 0 });
  assert.deepEqual(b.round!.result, { outcome: "loss", your_team_wins: 0, their_team_wins: 1 });
  assert.equal(a.round_wins, 1);
  assert.equal(b.round_wins, 0);
});

test("reaction duels hide the opponent's time until both play and then end the round", async () => {
  const h = await harness("reaction");
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const duel = (await h.me("alex")).round!.duels[0]!;
  assert.equal((await h.play("alex", duel.id, { ms: 200 })).status, 200);
  assert.equal((await h.me("alex")).round!.state, "playing");
  const response = await h.play("bea", duel.id, { ms: 300 });
  assert.equal(response.status, 200);
  screensSchemas.playReactionResponseSchema.parse(await response.json());
  assert.equal((await h.me("alex")).round!.result!.outcome, "win");
  assert.equal((await h.me("bea")).round!.result!.outcome, "loss");
  assert.equal((await h.play("alex", duel.id, { ms: 100 })).status, 409);
  assert.equal((await h.play("outsider", duel.id, { ms: 100 })).status, 404);
  assert.equal((await h.play("alex", duel.id, { ms: 0 })).status, 400);
});

test("the round waits for every duel and a played time beats an early tap", async () => {
  const h = await harness("reaction");
  for (const id of ["alex", "bea", "cai"]) await h.tap(id);
  h.clock.advanceSeconds(30);
  const smaller = (await h.me("bea")).round!;
  assert.equal(smaller.duels.length, 2);
  const first = smaller.duels[0]!,
    second = smaller.duels[1]!;
  await h.play("bea", first.id, { ms: 200 });
  await h.play(first.opponent, first.id, { early: true });
  assert.equal((await h.me("bea")).round!.state, "playing");
  await h.play("bea", second.id, { ms: 200 });
  await h.play(second.opponent, second.id, { ms: 200 });
  assert.deepEqual((await h.me("bea")).round!.result, {
    outcome: "win",
    your_team_wins: 2,
    their_team_wins: 1,
  });
});

test("a walk-away times out from the close even when nobody polled to form the round", async () => {
  const h = await harness("reaction");
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(150);
  const me = await h.me("alex");
  assert.equal(me.round!.state, "ended");
  // No duel was won, so the round is a win for nobody.
  assert.deepEqual(me.round!.result, { outcome: "loss", your_team_wins: 0, their_team_wins: 0 });
  assert.equal(me.round_wins, 0);
  const response = await h.play("alex", me.round!.duels[0]!.id, { ms: 100 });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "too_late" });
});

test("one played reaction wins after the opponent walks away", async () => {
  const h = await harness("reaction");
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const duel = (await h.me("alex")).round!.duels[0]!;
  await h.play("alex", duel.id, { ms: 250 });
  h.clock.advanceSeconds(119);
  assert.equal((await h.me("alex")).round!.state, "playing");
  h.clock.advanceSeconds(1);
  assert.equal((await h.me("alex")).round!.result!.outcome, "win");
  assert.equal((await h.me("bea")).round!.result!.outcome, "loss");
});

test("saved taps arriving after the close join no round and fresh taps start another", async () => {
  const h = await harness();
  const openedAt = h.clock.now().toISOString();
  await h.tap("alex");
  h.clock.advanceSeconds(30);
  assert.equal((await h.tap("bea", openedAt)).status, "no_game");
  assert.equal((await h.me("bea")).round, null);
  assert.equal(
    (await h.tap("cai", new Date(Date.parse(openedAt) - 1000).toISOString())).status,
    "no_game",
  );
  assert.equal((await h.tap("bea")).status, "accepted");
  assert.equal((await h.me("bea")).round!.state, "opening");
});

test("fresh players open the next round while an earlier reaction round is playing", async () => {
  const h = await harness("reaction");
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const first = (await h.me("alex")).round!;
  await h.tap("cai");
  await h.tap("dee");
  const next = (await h.me("cai")).round!;
  assert.notEqual(next.id, first.id);
  assert.equal(next.state, "opening");
  assert.equal((await h.tap("alex")).status, "cooldown");
  h.clock.advanceSeconds(30);
  assert.equal((await h.me("cai")).round!.state, "playing");
  assert.equal((await h.me("alex")).round!.state, "playing");
});

test("a player can join again after the result and keeps earlier round wins", async () => {
  const h = await harness();
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const first = (await h.me("alex")).round!;
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const me = await h.me("alex");
  assert.notEqual(me.round!.id, first.id);
  assert.equal(me.round_wins, 2);
});

test("the station board offers team duels and an organizer can choose it", async () => {
  const h = await harness();
  await testDb().update(stations).set({ game: null }).where(eq(stations.id, h.stationId));
  const headers = { Cookie: await h.cookie("organizer"), "Content-Type": "application/json" };
  const board = await h.app.request("/api/v1/admin/stations", { headers });
  assert.equal(board.status, 200);
  const body = (await board.json()) as { games: { id: string; name: string }[] };
  screensSchemas.eventStationBoardResponseSchema.parse(body);
  assert.deepEqual(body.games, [
    { id: "passport", name: "Passport" },
    { id: "team_duels", name: "Team duels" },
  ]);
  const set = await h.app.request(`/api/v1/admin/stations/${h.stationId}/game`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ game: "team_duels" }),
  });
  assert.equal(set.status, 200);
  screensSchemas.stationResponseSchema.parse(await set.json());
});

test("a user without a round sees null and zero wins with or without the game", async () => {
  const h = await harness();
  const withGame = await h.me("alex");
  assert.equal(withGame.round, null);
  assert.equal(withGame.round_wins, 0);
  const app = testApp({}, { teamDuels: null });
  const response = await app.request("/api/v1/me", { headers: { Cookie: await h.cookie("alex") } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { round: unknown; round_wins: number };
  screensSchemas.meResponseSchema.parse(body);
  assert.equal(body.round, null);
  assert.equal(body.round_wins, 0);
});

test("a committed opening round holds back a tap at another station", async () => {
  const h = await harness();
  await h.cookie("alex");
  await testDb()
    .insert(stations)
    .values({ id: "station-2", label: "Other", apiKeyHash: "a".repeat(64), game: "team_duels" });
  const other = () =>
    h.app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: "station-2",
        taps: [{ client_tap_id: crypto.randomUUID(), user_id: "alex", tapped_at: null }],
      }),
    });
  const one = await h.tap("alex");
  const response = await other();
  assert.equal(response.status, 200);
  const two = ((await response.json()) as { results: { status: string }[] }).results[0]!;
  assert.deepEqual([one.status, two.status].sort(), ["accepted", "cooldown"]);
  assert.equal((await h.me("alex")).round!.players, 1);
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const next = await other();
  assert.equal(next.status, 200);
  assert.equal(
    ((await next.json()) as { results: { status: string }[] }).results[0]!.status,
    "accepted",
  );
  const me = await h.me("alex");
  assert.equal(me.round!.state, "opening");
  assert.equal(me.round_wins, 1);
});

test("two phones forming the same round roll each die only once", async () => {
  let rolls = 0;
  const h = await harness("dice", () => {
    rolls++;
    return 4;
  });
  await h.tap("alex");
  await h.tap("bea");
  h.clock.advanceSeconds(30);
  const [a, b] = await Promise.all([h.me("alex"), h.me("bea")]);
  assert.equal(rolls, 2);
  assert.equal(a.round!.duels[0]!.id, b.round!.duels[0]!.id);
  await h.me("alex");
  assert.equal(rolls, 2);
});

test("an organizer's chosen challenge overrides the random pick for a whole round", async () => {
  const h = await harness("reaction");
  const response = await h.app.request("/api/v1/admin/connections/challenge", {
    method: "PUT",
    headers: { Cookie: await h.cookie("organizer"), "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: "dice" }),
  });
  assert.equal(response.status, 200);
  for (const id of ["alex", "bea", "cai"]) await h.tap(id);
  h.clock.advanceSeconds(30);
  const round = (await h.me("bea")).round!;
  assert.equal(round.challenge, "dice");
  assert.ok(round.duels.every((d) => d.dice !== null && d.reaction === null));
  assert.equal((await h.play("bea", round.duels[0]!.id, { ms: 100 })).status, 404);
});

test("station lines shorten names and fall back for names the screen cannot show", async () => {
  const h = await harness();
  await h.cookie("alex");
  await testDb()
    .update(users)
    .set({ displayName: "Álexanderthelongest" })
    .where(eq(users.id, "alex"));
  assert.deepEqual((await h.tap("alex")).lines, ["Alexander joined", "1 in, 30s left"]);
  await h.cookie("bea");
  await testDb().update(users).set({ displayName: "小明" }).where(eq(users.id, "bea"));
  h.clock.advanceSeconds(6);
  assert.deepEqual((await h.tap("bea")).lines, ["Player joined", "2 in, 24s left"]);
});

test("joining and late taps by owners who never logged in keep null scan names and no user rows", async () => {
  const h = await harness();
  const openedAt = h.clock.now().toISOString();
  assert.equal((await h.tap("unseen", null, false)).status, "accepted");
  await h.tap("alex");
  h.clock.advanceSeconds(30);
  assert.equal((await h.tap("late-unseen", openedAt, false)).status, "no_game");
  assert.equal((await h.me("alex")).round!.duels[0]!.opponent, "Guest");
  const response = await h.app.request("/api/v1/admin/taps", {
    headers: { Cookie: await h.cookie("organizer") },
  });
  assert.equal(response.status, 200);
  const log = (await response.json()) as {
    taps: { user: { id: string; display_name: string | null } }[];
  };
  screensSchemas.listTapsResponseSchema.parse(log);
  for (const id of ["unseen", "late-unseen"]) {
    assert.deepEqual(log.taps.find((t) => t.user.id === id)!.user, { id, display_name: null });
    assert.deepEqual(await testDb().select().from(users).where(eq(users.id, id)), []);
  }
});

for (const count of [4, 5, 12]) {
  test(`${count} players split each group evenly and meet other groups`, async () => {
    const h = await harness();
    const ids = Array.from({ length: count }, (_, i) => `player-${i}`);
    const groupOf = (id: string) => Math.floor(ids.indexOf(id) / (count === 12 ? 4 : 2));
    for (const id of ids) await h.tap(id);
    for (const g of new Set(ids.map(groupOf))) {
      await testDb()
        .insert(participantGroups)
        .values({
          id: `group-${g}`,
          name: `Group ${g}`,
          tags: [],
          createdAt: h.clock.now().toISOString(),
        });
      await testDb()
        .insert(groupMembers)
        .values(
          ids
            .filter((id) => groupOf(id) === g)
            .map((userId) => ({
              userId,
              groupId: `group-${g}`,
              joinedAt: h.clock.now().toISOString(),
            })),
        );
    }
    h.clock.advanceSeconds(30);
    const results = await Promise.all(
      ids.map(async (id) => ({ id, round: (await h.me(id)).round! })),
    );
    const imbalance = (rows: typeof results) =>
      Math.abs(
        rows.filter((r) => r.round.team === "a").length -
          rows.filter((r) => r.round.team === "b").length,
      );
    assert.ok(imbalance(results) <= 1);
    for (const g of new Set(ids.map(groupOf)))
      assert.ok(imbalance(results.filter((r) => groupOf(r.id) === g)) <= 1);
    for (const { id, round } of results) {
      for (const duel of round.duels) assert.notEqual(groupOf(duel.opponent), groupOf(id));
    }
  });
}

test("several finished rounds count wins once and leave the latest opening round visible", async () => {
  const h = await harness();
  for (let i = 0; i < 4; i++) {
    await h.tap("alex");
    await h.tap("bea");
    h.clock.advanceSeconds(30);
    assert.equal((await h.me("alex")).round_wins, i + 1);
  }
  await h.tap("alex");
  const latest = await h.me("alex");
  assert.equal(latest.round!.state, "opening");
  assert.equal(latest.round_wins, 4);
  const stored = await testDb().select().from(duelRounds);
  assert.equal(stored.filter((r) => r.endedAt !== null).length, 4);
  assert.equal(
    (
      await testDb().select().from(duelRoundPlayers).where(eq(duelRoundPlayers.userId, "alex"))
    ).filter((p) => p.won).length,
    4,
  );
  assert.deepEqual(await h.me("alex"), latest);
});

test("simultaneous taps at one station accept one membership and hold the repeat back", async () => {
  const h = await harness();
  await h.cookie("alex");
  const results = await Promise.all([h.tap("alex"), h.tap("alex")]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["accepted", "cooldown"]);
  assert.equal((await h.me("alex")).round!.players, 1);
});

test("forming and a simultaneous tap at another station both finish", async () => {
  const h = await harness();
  await h.tap("alex");
  await h.tap("bea");
  await testDb()
    .insert(stations)
    .values({ id: "station-2", label: "Other", apiKeyHash: "a".repeat(64), game: "team_duels" });
  h.clock.advanceSeconds(30);
  const [me, tap] = await Promise.all([
    h.me("alex"),
    h.app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: "station-2",
        taps: [{ client_tap_id: "racing", user_id: "alex", tapped_at: null }],
      }),
    }),
  ]);
  assert.equal(me.round_wins, 1);
  assert.equal(tap.status, 200);
});

test("without a team duels station the passport counts taps and connections still form", async () => {
  const h = await harness();
  await testDb().update(stations).set({ game: "passport" }).where(eq(stations.id, h.stationId));
  const app = testApp(
    {},
    {
      now: h.clock.now,
      connections: connectionsGame(null, { rollDie: () => 4, pickGame: () => "dice" }),
    },
  );
  await h.cookie("alex");
  await h.cookie("bea");
  assert.equal((await h.tap("alex")).status, "accepted");
  assert.equal((await h.tap("alex")).status, "cooldown");
  for (const [user_id, owner_id, user_kind, owner_kind, expected] of [
    ["alex", "bea", "E", "B", "waiting"],
    ["bea", "alex", "B", "E", "connected"],
  ]) {
    const res = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id, owner_id, user_kind, owner_kind }),
    });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, expected);
  }
  const response = await app.request("/api/v1/me", { headers: { Cookie: await h.cookie("alex") } });
  assert.equal(response.status, 200);
  const me = (await response.json()) as {
    round: unknown;
    round_wins: number;
    stamps: { earned_at: string | null }[];
    connections: unknown[];
    recent_taps: unknown[];
  };
  screensSchemas.meResponseSchema.parse(me);
  assert.equal(me.round, null);
  assert.equal(me.round_wins, 0);
  assert.equal(me.connections.length, 1);
  assert.equal(me.stamps.filter((s) => s.earned_at !== null).length, 1);
  assert.equal(me.recent_taps.length, 2);
});
