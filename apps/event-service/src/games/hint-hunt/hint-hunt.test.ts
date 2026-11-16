import { eq } from "drizzle-orm";
import { answersGame } from "../connections/answers.ts";
import { answers } from "../connections/schema.ts";
import { hintHuntGame, type Schedule } from "./hint-hunt.ts";
import type { Question } from "../../event/answers.ts";

const questions: Question[] = Array.from({ length: 5 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Full question ${i + 1}?`,
  choices: [
    { id: "a", text: "Full choice A" },
    { id: "b", text: "Full choice B" },
  ],
}));
import assert from "node:assert/strict";
import { stationMessageRequest, stationsAnswer, tapsAnswer } from "@geekykey/handoff";
import { test } from "vitest";
import { stations, users, participantGroups, groupMembers } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  testApp,
  testDb,
  TEST_EVENT_SERVICE_KEY,
} from "../../test-helpers.ts";

test("an organizer assigns hint hunt and the station board lists it last", async () => {
  const db = testDb();
  await db.insert(users).values({ id: "organizer", displayName: "Organizer" });
  await db.insert(stations).values({ id: "A", label: "A", apiKeyHash: "a".repeat(64) });
  const app = testApp({ ORGANIZERS: "organizer" });
  const login = await app.request("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "organizer" }),
  });
  const Cookie = login.headers.get("Set-Cookie")!.split(";")[0]!;
  const assigned = await app.request("/api/v1/admin/stations/A/game", {
    method: "PUT",
    headers: { Cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ game: "hint_hunt" }),
  });
  assert.equal(assigned.status, 200);
  screensSchemas.stationResponseSchema.parse(await assigned.json());
  const board = await app.request("/api/v1/admin/stations", { headers: { Cookie } });
  const body = (await board.json()) as { games: { id: string; name: string }[] };
  screensSchemas.eventStationBoardResponseSchema.parse(body);
  assert.deepEqual(body.games.at(-1), { id: "hint_hunt", name: "Hint hunt" });
  const registered = await app.request("/geekykey/v1/stations", {
    headers: { Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}` },
  });
  assert.deepEqual(stationsAnswer.parse(await registered.json()).stations[0]!.idle_lines, [
    "Hint hunt",
    "Tap to join",
  ]);
});

async function harness(
  options: {
    pickTarget?: (ids: readonly string[]) => string;
    rules?: Parameters<typeof hintHuntGame>[0]["rules"];
    questions?: Question[];
    schedule?: Schedule;
    rollback?: boolean;
  } = {},
) {
  const clock = fakeClock("2026-11-16T08:00:00.000Z");
  const db = testDb();
  await db
    .insert(stations)
    .values({ id: "A", label: "A", game: "hint_hunt", apiKeyHash: "a".repeat(64) });
  await db.insert(participantGroups).values([
    { id: "g1", name: "One", tags: [], createdAt: clock.now().toISOString() },
    { id: "g2", name: "Two", tags: [], createdAt: clock.now().toISOString() },
  ]);
  for (const [i, id] of ["player-one", "player-two", "player-three", "outsider"].entries()) {
    await db.insert(users).values({ id, displayName: `Secret name ${i}` });
    await db
      .insert(groupMembers)
      .values({ userId: id, groupId: i === 0 ? "g1" : "g2", joinedAt: clock.now().toISOString() });
  }
  const messages: import("@geekykey/handoff").StationMessageRequest[] = [];
  const scheduled: { work: () => Promise<void>; at: number }[] = [];
  const gameAnswers = answersGame(options.questions ?? questions);
  const app = testApp(
    { ORGANIZERS: "organizer", MAP_SCREENS: "map", GEEKYKEY_SERVICE_URL: "https://key.example" },
    {
      now: clock.now,
      answers: gameAnswers,
      send: async (_input, init) => {
        messages.push(stationMessageRequest.parse(JSON.parse(String(init?.body))));
        return Response.json({ delivered: false });
      },
      games: (deps) => {
        const game = hintHuntGame({
          ...deps,
          ...options,
          pickTarget: options.pickTarget ?? ((ids) => ids[0]!),
          schedule:
            options.schedule ??
            ((work, delay) => scheduled.push({ work, at: clock.now().getTime() + delay })),
        });
        return [
          {
            game: options.rollback
              ? {
                  ...game,
                  lines: async () => {
                    throw new Error("Rollback probe");
                  },
                }
              : game,
            stations: "chosen",
            name: "Hint hunt",
          },
        ];
      },
    },
  );
  async function tap(user = "player-one", station = "A", clientId: string = crypto.randomUUID()) {
    const res = await app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: station,
        taps: [{ client_tap_id: clientId, user_id: user, tapped_at: null }],
      }),
    });
    assert.equal(res.status, 200);
    return tapsAnswer.parse(await res.json()).results[0]!;
  }
  async function cookie(id = "map") {
    await db.insert(users).values({ id, displayName: id }).onDuplicateKeyUpdate({ set: { id } });
    const res = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    return res.headers.get("Set-Cookie")!.split(";")[0]!;
  }
  async function map() {
    const res = await app.request("/api/v1/map/hint-hunt", { headers: { Cookie: await cookie() } });
    assert.equal(res.status, 200);
    return (await res.json()) as {
      hint_hunt: import("../../event/hint-hunt.ts").HintHuntMapState | null;
    };
  }
  async function answer(userId: string, choices: Record<string, string>, fixed = true) {
    await db
      .insert(answers)
      .values({ userId, choices, fixedAt: fixed ? clock.now().toISOString() : null })
      .onDuplicateKeyUpdate({
        set: { choices, fixedAt: fixed ? clock.now().toISOString() : null },
      });
  }
  async function joinThree() {
    for (const id of ["player-one", "player-two", "player-three"]) await tap(id);
  }
  return { clock, db, app, tap, cookie, map, messages, scheduled, answer, joinThree };
}

test("the first tap opens a join window and repeat taps and people without groups are held back", async () => {
  const h = await harness();
  const first = await h.tap();
  assert.equal(first.status, "accepted");
  assert.deepEqual(first.lines, ["Hint hunt", "1 in, 30s left"]);
  assert.deepEqual(first.countdown, {
    seconds: 30,
    lines: ["Hint hunt", "1 in, {s}s left"],
    ending: ["Hints coming", ""],
  });
  h.clock.advanceSeconds(2);
  const repeat = await h.tap();
  assert.equal(repeat.status, "cooldown");
  assert.deepEqual(repeat.lines, ["Already in", "1 in, 28s left"]);
  assert.equal(repeat.countdown!.seconds, 28);
  const noGroup = await h.tap("no-group");
  assert.equal(noGroup.status, "cooldown");
  assert.deepEqual(noGroup.lines, ["Join a group", "on your phone"]);
  assert.equal((await h.tap("player-two")).status, "accepted");
});

test("a round without three players from two groups ends when the map polls", async () => {
  const h = await harness();
  await h.tap();
  h.clock.advanceSeconds(30);
  const round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.ended_how, "too_few");
  assert.equal(round.ended_at, "2026-11-16T08:00:30.000Z");
  assert.deepEqual(h.messages.at(-1)!.lines, ["Need 3 players", "from 2 groups"]);
  assert.equal(round.started_at, null);
  assert.deepEqual(round.hints, []);
});

test("hints narrow greedily with list order breaking ties and appear according to time", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a", q2: "b", q3: "a", q4: "b", q5: "a" });
  await h.answer("player-two", { q1: "b", q2: "b", q3: "a", q4: "a", q5: "a" });
  await h.answer("player-three", { q1: "b", q2: "b", q3: "b", q4: "b", q5: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(29.999);
  assert.deepEqual((await h.map()).hint_hunt!.rounds[0]!.hints, []);
  h.clock.advanceSeconds(0.001);
  let round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.started_at, "2026-11-16T08:00:30.000Z");
  assert.deepEqual(round.hints, [
    { question: "Full question 2?", choice: "Full choice B", short: "Q2B" },
  ]);
  assert.equal(round.next_hint_at, "2026-11-16T08:00:40.000Z");
  assert.equal(round.ends_at, null);
  h.clock.advanceSeconds(10);
  assert.deepEqual(
    (await h.map()).hint_hunt!.rounds[0]!.hints.map((hint) => hint.short),
    ["Q2B", "Q5A"],
  );
  h.clock.advanceSeconds(20);
  round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.deepEqual(
    round.hints.map((hint) => hint.short),
    ["Q2B", "Q5A", "Q3A", "Q1A"],
  );
  assert.equal(round.next_hint_at, null);
  assert.equal(round.ends_at, "2026-11-16T08:01:10.000Z");
});

for (const winner of ["player-one", "player-two"]) {
  test(`a matching ${winner} wins whether or not they were picked`, async () => {
    const h = await harness();
    await h.answer("player-one", { q1: "a", q2: "b" });
    await h.answer("player-two", { q1: "a", q2: "a" });
    await h.answer("player-three", { q1: "b", q2: "a" });
    await h.joinThree();
    h.clock.advanceSeconds(30);
    const won = await h.tap(winner);
    assert.equal(won.status, "accepted");
    assert.deepEqual(won.lines, ["Found a match!", "Round won"]);
    assert.equal(won.complete, true);
    assert.equal(won.countdown, undefined);
    assert.equal((await h.map()).hint_hunt!.rounds[0]!.ended_how, "won");
    h.clock.advanceSeconds(20);
    assert.deepEqual(
      (await h.map()).hint_hunt!.rounds[0]!.hints.map((hint) => hint.short),
      ["Q1A"],
    );
  });
}

test("three misses use the shared tries and a non-player costs none", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a", q2: "b" });
  await h.answer("player-two", { q1: "b", q2: "a" });
  await h.answer("player-three", { q1: "b", q2: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  const outsider = await h.tap("outsider");
  assert.equal(outsider.status, "cooldown");
  assert.deepEqual(outsider.lines, ["Round running", "Join next one"]);
  assert.equal(outsider.countdown!.seconds, 10);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.tries_left, 3);
  for (const [secondLine, left] of [
    ["No! 2 tries left", 2],
    ["No! 1 try left", 1],
  ] as const) {
    const miss = await h.tap("player-two");
    assert.equal(miss.status, "cooldown");
    assert.deepEqual(miss.lines, ["Q1A", secondLine]);
    assert.deepEqual(miss.countdown, {
      seconds: 10,
      lines: ["Q1A", secondLine],
      ending: ["Q1A", "Next hint..."],
    });
    assert.equal((await h.map()).hint_hunt!.rounds[0]!.tries_left, left);
  }
  const lost = await h.tap("player-three");
  assert.deepEqual(lost.lines, ["No match", "Round lost"]);
  assert.equal(lost.countdown, undefined);
  assert.equal(lost.complete, undefined);
  const round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.tries_left, 0);
  assert.equal(round.ended_how, "lost_tries");
});

test("the last hint counts down to a timed loss and the next tap opens another round", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  let round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.next_hint_at, null);
  assert.equal(round.ends_at, "2026-11-16T08:00:40.000Z");
  assert.deepEqual(h.messages.at(-1)!.countdown, {
    seconds: 10,
    lines: ["Q1A", "Last! {s}s left"],
    ending: ["Time's up", "Round lost"],
  });
  h.clock.advanceSeconds(9.999);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.ended_at, null);
  h.clock.advanceSeconds(0.001);
  round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.ended_how, "lost_time");
  assert.equal(round.ended_at, "2026-11-16T08:00:40.000Z");
  const next = await h.tap();
  assert.deepEqual(next.lines, ["Hint hunt", "1 in, 30s left"]);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.opened_at, "2026-11-16T08:00:40.000Z");
});

test("the map's answer, station screens and station messages contain no player's identity", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  const screens = [];
  screens.push(await h.tap(), await h.tap("player-two"), await h.tap("player-three"));
  h.clock.advanceSeconds(30);
  const map = await h.map();
  screens.push(await h.tap("player-one"));
  const serialized = JSON.stringify({ map, screens, messages: h.messages });
  for (const id of ["player-one", "player-two", "player-three", "outsider"])
    assert.ok(!serialized.includes(id));
  assert.ok(!serialized.includes("Secret name"));
});

test("only joined players with fixed current answers can be picked and an unfixed guess misses", async () => {
  const choices: string[][] = [];
  const h = await harness({
    pickTarget: (ids) => {
      choices.push([...ids]);
      return ids[0]!;
    },
  });
  await h.answer("player-one", { q1: "a" }, false);
  await h.answer("player-two", { q1: "a" });
  await h.answer("player-three", { retired: "a" });
  await h.answer("outsider", { q1: "b" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  assert.deepEqual((await h.map()).hint_hunt!.rounds[0]!.hints, [
    { question: "Full question 1?", choice: "Full choice A", short: "Q1A" },
  ]);
  assert.deepEqual(choices, [["player-two"]]);
  const miss = await h.tap("player-one");
  assert.deepEqual(miss.lines, ["Q1A", "No! 2 tries left"]);
  assert.equal(miss.status, "cooldown");
});

for (const fixed of [true, false]) {
  test(`a round with no eligible target ends even when outsider answers are fixed and joined answers are ${fixed ? "removed" : "unfixed"}`, async () => {
    const h = await harness();
    await h.answer("outsider", { q1: "b" });
    await h.answer("player-one", fixed ? { retired: "a" } : { q1: "a" }, fixed);
    await h.joinThree();
    h.clock.advanceSeconds(30);
    const round = (await h.map()).hint_hunt!.rounds[0]!;
    assert.equal(round.ended_how, "no_target");
    assert.deepEqual(round.hints, []);
    assert.deepEqual(h.messages.at(-1)!.lines, ["No answers yet", "Round over"]);
  });
}

test("three players from one group still end with the minimum-player message", async () => {
  const h = await harness();
  await h.db.update(groupMembers).set({ groupId: "g1" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.ended_how, "too_few");
  assert.deepEqual(h.messages.at(-1)!.lines, ["Need 3 players", "from 2 groups"]);
  await h.map();
  assert.equal(h.messages.length, 1);
});

test("timers and concurrent map polls announce each hint once even when delivery is dropped", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a", q2: "b", q3: "a", q4: "b", q5: "a" });
  await h.joinThree();
  assert.equal(h.scheduled.length, 1);
  assert.equal(h.scheduled[0]!.at, Date.parse("2026-11-16T08:00:30.000Z"));
  h.clock.advanceSeconds(30);
  await Promise.all([h.scheduled[0]!.work(), h.map(), h.map()]);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0]!.beep, true);
  assert.deepEqual(h.messages[0]!.lines, ["Q1A", "Next hint 10s"]);
  assert.equal(h.scheduled.length, 5);
  for (let i = 1; i < 4; i++) {
    h.clock.advanceSeconds(10);
    const job = h.scheduled.find((job) => job.at === h.clock.now().getTime())!;
    await Promise.all([job.work(), h.map(), job.work()]);
    assert.equal(h.messages.length, i + 1);
    assert.equal(h.messages.at(-1)!.beep, true);
  }
  assert.deepEqual(h.messages.at(-1)!.lines, ["Q1A Q2B Q3A Q4B", "Last! 10s left"]);
  assert.equal(h.messages.at(-1)!.countdown!.seconds, 10);
});

test("the join timer sends the too-few line without a tap or map poll", async () => {
  const h = await harness();
  await h.tap();
  h.clock.advanceSeconds(30);
  await h.scheduled[0]!.work();
  assert.deepEqual(
    h.messages.map((message) => message.lines),
    [["Need 3 players", "from 2 groups"]],
  );
});

test("the hint hunt poll authenticates readers and has its own ninety requests", async () => {
  const h = await harness();
  const path = "/api/v1/map/hint-hunt";
  assert.equal((await h.app.request(path)).status, 401);
  assert.equal(
    (await h.app.request(path, { headers: { Cookie: await h.cookie("participant") } })).status,
    403,
  );
  const headers = { Cookie: await h.cookie() };
  for (let i = 0; i < 90; i++) assert.equal((await h.app.request(path, { headers })).status, 200);
  const over = await h.app.request(path, { headers });
  assert.equal(over.status, 429);
  assert.equal(over.headers.get("Retry-After"), "60");
  for (let i = 0; i < 60; i++)
    assert.equal((await h.app.request("/api/v1/map", { headers })).status, 200);
  assert.equal((await h.app.request("/api/v1/map", { headers })).status, 429);
  assert.equal(
    (await h.app.request(path, { headers: { Cookie: await h.cookie("organizer") } })).status,
    200,
  );
  h.clock.advanceSeconds(60);
  assert.equal((await h.app.request(path, { headers })).status, 200);
  const noGame = testApp({ MAP_SCREENS: "map" }, { games: () => [] });
  const absent = await noGame.request(path, { headers });
  assert.equal(absent.status, 200);
  assert.deepEqual(await absent.json(), { hint_hunt: null });
});

test("a hint hunt win earns no points stamps or connections and adds no identities to me", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  await h.tap();
  const res = await h.app.request("/api/v1/me", {
    headers: { Cookie: await h.cookie("player-two") },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { points: number; stamps: unknown[]; connections: unknown[] };
  screensSchemas.meResponseSchema.parse(body);
  assert.equal(body.points, 0);
  assert.deepEqual(body.stamps, []);
  assert.deepEqual(body.connections, []);
  assert.ok(!JSON.stringify(body).includes("player-one"));
  assert.ok(!JSON.stringify(body).includes("Secret name 0"));
});

test("the map shows only the latest round at each enabled station in station creation order", async () => {
  const h = await harness();
  await h.db.insert(stations).values(
    ["B", "C"].map((id) => ({
      id,
      label: id,
      game: "hint_hunt",
      apiKeyHash: id.toLowerCase().repeat(64),
      createdAt: "2026-11-15T08:00:00.000Z",
    })),
  );
  assert.deepEqual(await h.map(), { hint_hunt: { rounds: [] } });
  await h.tap();
  await h.tap("player-two", "B");
  assert.deepEqual(await h.map(), {
    hint_hunt: {
      rounds: [
        {
          station_id: "B",
          opened_at: "2026-11-16T08:00:00.000Z",
          joining_until: "2026-11-16T08:00:30.000Z",
          players: 1,
          started_at: null,
          hints: [],
          tries_left: 3,
          next_hint_at: null,
          ends_at: null,
          ended_at: null,
          ended_how: null,
        },
        {
          station_id: "A",
          opened_at: "2026-11-16T08:00:00.000Z",
          joining_until: "2026-11-16T08:00:30.000Z",
          players: 1,
          started_at: null,
          hints: [],
          tries_left: 3,
          next_hint_at: null,
          ends_at: null,
          ended_at: null,
          ended_how: null,
        },
      ],
    },
  });
  await h.db
    .update(stations)
    .set({ disabledAt: h.clock.now().toISOString() })
    .where(eq(stations.id, "B"));
  assert.deepEqual(
    (await h.map()).hint_hunt!.rounds.map((round) => round.station_id),
    ["A"],
  );
  await h.db.update(stations).set({ game: "relay" }).where(eq(stations.id, "A"));
  assert.deepEqual(await h.map(), { hint_hunt: { rounds: [] } });
});

test("stored hints survive changed answers and a guess uses the player's current fixed answers", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a", q2: "b" });
  await h.answer("player-two", { q1: "a", q2: "b" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  await h.map();
  await h.answer("player-one", { q1: "b", q2: "a" });
  assert.deepEqual((await h.tap()).lines, ["Q1A", "No! 2 tries left"]);
  h.clock.advanceSeconds(10);
  assert.deepEqual(
    (await h.map()).hint_hunt!.rounds[0]!.hints.map((hint) => hint.short),
    ["Q1A", "Q2B"],
  );
  assert.equal((await h.tap("player-two")).complete, true);
});

test("an overdue round ends from its stored times when the next tap arrives, with no message over the new round", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(100);
  const next = await h.tap();
  assert.deepEqual(next.lines, ["Hint hunt", "1 in, 30s left"]);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.opened_at, "2026-11-16T08:01:40.000Z");
  assert.deepEqual(h.messages, []);
});

test("a repeated hand-off tap neither joins twice nor takes another try", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  await h.tap("player-one", "A", "joined-once");
  assert.deepEqual(await h.tap("player-one", "A", "joined-once"), {
    client_tap_id: "joined-once",
    status: "duplicate",
  });
  await h.tap("player-two");
  await h.tap("player-three");
  h.clock.advanceSeconds(30);
  await h.tap("player-two", "A", "miss-once");
  assert.deepEqual(await h.tap("player-two", "A", "miss-once"), {
    client_tap_id: "miss-once",
    status: "duplicate",
  });
  const round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.players, 3);
  assert.equal(round.tries_left, 2);
  // A tap leaves the first hint's message to the poll, which sends it once.
  assert.equal(h.messages.length, 1);
});

test("overridden rules change both deadlines and counts and countdowns round up", async () => {
  const h = await harness({
    rules: {
      joinMs: 1500,
      hintEveryMs: 1500,
      maxHints: 2,
      afterLastHintMs: 2500,
      tries: 2,
      minPlayers: 2,
      minGroups: 1,
    },
  });
  await h.answer("player-one", { q1: "a", q2: "a", q3: "a" });
  assert.equal((await h.tap()).countdown!.seconds, 2);
  await h.tap("player-two");
  h.clock.advanceSeconds(1.5);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.tries_left, 2);
  h.clock.advanceSeconds(1.5);
  const round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.hints.length, 2);
  assert.equal(round.ends_at, "2026-11-16T08:00:05.500Z");
  const miss = await h.tap("player-two");
  assert.equal(miss.countdown!.seconds, 3);
  assert.deepEqual(miss.lines, ["Q1A Q2A", "No! 1 try left"]);
  assert.deepEqual((await h.tap("player-two")).lines, ["No match", "Round lost"]);
});

test("short hints drop their Qs when double-digit question numbers would overflow the screen", async () => {
  const longer = Array.from({ length: 12 }, (_, i) => ({ ...questions[0]!, id: `q${i + 1}` }));
  const h = await harness({ questions: longer });
  await h.answer("player-one", { q9: "a", q10: "a", q11: "a", q12: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(60);
  const round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.deepEqual(
    round.hints.map((hint) => hint.short),
    ["Q9A", "Q10A", "Q11A", "Q12A"],
  );
  assert.deepEqual(h.messages.at(-1)!.lines, ["9A 10A 11A 12A", "Last! 10s left"]);
});

test("a rolled-back ingest leaves no round no message and no scheduled callback", async () => {
  const h = await harness({ rollback: true });
  const response = await h.app.request("/geekykey/v1/taps", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      station_id: "A",
      taps: [{ client_tap_id: "rollback", user_id: "player-one", tapped_at: null }],
    }),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await h.map(), { hint_hunt: { rounds: [] } });
  assert.deepEqual(h.scheduled, []);
  assert.deepEqual(h.messages, []);
});

test("a tap received before a poll started the round costs no try and wins nothing", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  await h.answer("player-two", { q1: "b" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  await h.map();
  // The ingest's time was taken before it waited behind the poll for the station's lock.
  h.clock.advanceSeconds(-0.001);
  const late = await h.tap("player-two");
  assert.equal(late.status, "cooldown");
  assert.deepEqual(late.lines, ["Q1A", "Last! 10s left"]);
  const round = (await h.map()).hint_hunt!.rounds[0]!;
  assert.equal(round.ended_how, null);
  assert.equal(round.tries_left, 3);
});

test("a winning tap that brings a hint due sends no message to show over its win", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a" });
  await h.answer("player-two", { q1: "a" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  const won = await h.tap("player-two");
  assert.deepEqual(won.lines, ["Found a match!", "Round won"]);
  assert.equal(won.complete, true);
  await h.map();
  assert.deepEqual(h.messages, []);
  assert.equal((await h.map()).hint_hunt!.rounds[0]!.ended_how, "won");
});

test("a tap at a hint's time leaves its message and beep to the next poll", async () => {
  const h = await harness();
  await h.answer("player-one", { q1: "a", q2: "b" });
  await h.joinThree();
  h.clock.advanceSeconds(30);
  await h.map();
  h.clock.advanceSeconds(10);
  assert.deepEqual((await h.tap("outsider")).lines, ["Round running", "Join next one"]);
  await h.map();
  assert.equal(h.messages.length, 2);
  assert.deepEqual(h.messages[1]!.lines, ["Q1A Q2B", "Last! 10s left"]);
  assert.equal(h.messages[1]!.beep, true);
});
