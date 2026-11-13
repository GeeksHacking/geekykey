import assert from "node:assert/strict";
import { stationMessageRequest, stationsAnswer, tapsAnswer } from "@geekykey/handoff";
import { test } from "vitest";
import { eq } from "drizzle-orm";
import type { RelayMapState } from "../../event/relay.ts";
import { groupMembers, participantGroups, stations, users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  testApp,
  testDb,
  TEST_EVENT_SERVICE_KEY,
} from "../../test-helpers.ts";
import { relayGame } from "./relay.ts";

async function harness(
  groupCount = 3,
  options: {
    send?: typeof fetch;
    pickGroup?: (ids: readonly string[]) => string;
    rules?: Parameters<typeof relayGame>[0]["rules"];
    rollback?: boolean;
  } = {},
) {
  const clock = fakeClock("2026-11-13T08:00:00.000Z");
  const db = testDb();
  await db.insert(stations).values(
    ["A", "B"].map((booth, i) => ({
      id: booth,
      label: booth,
      booth,
      game: "relay",
      apiKeyHash: booth.toLowerCase().repeat(64),
      createdAt: `2026-11-13T07:00:0${i}.000Z`,
    })),
  );
  for (const [i, name] of ["Red", "Blue", "Green"].slice(0, groupCount).entries()) {
    await db
      .insert(participantGroups)
      .values({ id: name, name, tags: [], createdAt: `2026-11-13T07:00:0${i}.000Z` });
    await db
      .insert(groupMembers)
      .values({ userId: name.toLowerCase(), groupId: name, joinedAt: clock.now().toISOString() });
  }
  const app = testApp(
    { ORGANIZERS: "organizer", MAP_SCREENS: "map", GEEKYKEY_SERVICE_URL: "https://key.example" },
    {
      now: clock.now,
      send: options.send ?? (async () => Response.json({ delivered: false })),
      games: ({ stationMessages }) => {
        const game = relayGame({
          stationMessages,
          pickGroup: options.pickGroup ?? ((ids) => ids[0]!),
          rules: options.rules,
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
            name: "Relay",
          },
        ];
      },
    },
  );
  const cookies = new Map<string, string>();
  async function cookie(id = "map") {
    if (cookies.has(id)) return cookies.get(id)!;
    await db
      .insert(users)
      .values({ id, displayName: id })
      .onDuplicateKeyUpdate({ set: { displayName: id } });
    const res = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    assert.equal(res.status, 204);
    const value = res.headers.get("Set-Cookie")!.split(";")[0]!;
    cookies.set(id, value);
    return value;
  }
  async function tap(
    station = "A",
    user = "red",
    clientId: string = crypto.randomUUID(),
    tappedAt: string | null = null,
  ) {
    const res = await app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: station,
        taps: [{ client_tap_id: clientId, user_id: user, tapped_at: tappedAt }],
      }),
    });
    assert.equal(res.status, 200);
    return tapsAnswer.parse(await res.json()).results[0]!;
  }
  async function map() {
    const res = await app.request("/api/v1/map/relay", { headers: { Cookie: await cookie() } });
    assert.equal(res.status, 200);
    return (await res.json()) as { relay: RelayMapState | null };
  }
  return { app, db, clock, cookie, tap, map };
}

for (const [station, other] of [
  ["A", "B"],
  ["B", "A"],
]) {
  test(`a tap at ${station} starts a relay and calls another group to ${other}`, async () => {
    const h = await harness();
    const answer = await h.tap(station);
    assert.equal(answer.status, "accepted");
    assert.deepEqual(answer.lines, ["Sent!", `Blue to ${other}`]);
    assert.deepEqual(answer.countdown, {
      seconds: 20,
      lines: [`Blue to ${other}`, "{s}s left"],
      ending: ["Missed it", "Tap again"],
    });
  });
}

test("the needed group completes a transfer and calls the next group back", async () => {
  const h = await harness();
  await h.tap();
  h.clock.advanceSeconds(5);
  const answer = await h.tap("B", "blue");
  assert.equal(answer.status, "accepted");
  assert.deepEqual(answer.lines, ["Got it!", "Red to A"]);
  assert.equal(answer.countdown!.seconds, 20);
});

test("a wrong group, the last group and someone without a group leave the call waiting", async () => {
  const h = await harness();
  await h.tap();
  for (const user of ["green", "red"]) {
    const answer = await h.tap("B", user);
    assert.equal(answer.status, "cooldown");
    assert.deepEqual(answer.lines, ["Not you", "Ask at A"]);
    assert.equal(answer.countdown, undefined);
  }
  const unplaced = await h.tap("B", "unplaced");
  assert.equal(unplaced.status, "cooldown");
  assert.deepEqual(unplaced.lines, ["Join a group", "on your phone"]);
  h.clock.advanceSeconds(2);
  const waiting = await h.tap("A", "green");
  assert.equal(waiting.status, "cooldown");
  assert.deepEqual(waiting.lines, ["Still waiting", "Blue to B"]);
  assert.equal(waiting.countdown!.seconds, 18);
  assert.deepEqual((await h.tap("B", "blue")).lines, ["Got it!", "Red to A"]);
});

test("a missed call loses no completed transfers and the calling station can ask again", async () => {
  const h = await harness();
  await h.tap();
  h.clock.advanceSeconds(20);
  const late = await h.tap("B", "blue");
  assert.equal(late.status, "cooldown");
  assert.deepEqual(late.lines, ["Too late", "Ask at A"]);
  assert.equal(late.countdown, undefined);
  assert.deepEqual((await h.tap("A", "green")).lines, ["Sent!", "Red to B"]);
  h.clock.advanceSeconds(1);
  assert.deepEqual((await h.tap("B", "red")).lines, ["Got it!", "Blue to A"]);
});

for (const [groups, needed] of [
  [2, 3],
  [3, 4],
]) {
  test(`a ${groups}-group relay ends at ${needed} transfers and the next tap starts again`, async () => {
    const sent: Request[] = [];
    const h = await harness(groups, {
      send: async (input, init) => {
        sent.push(new Request(input, init));
        return Response.json({ delivered: true });
      },
    });
    await h.tap();
    for (let i = 1; i <= needed!; i++) {
      h.clock.advanceSeconds(1);
      const answer = await h.tap(i % 2 === 1 ? "B" : "A", i % 2 === 1 ? "blue" : "red");
      if (i < needed!) assert.equal(answer.complete, undefined);
      else {
        assert.deepEqual(answer.lines, ["Relay done!", `${needed} of ${needed}`]);
        assert.equal(answer.complete, true);
        assert.equal(answer.countdown, undefined);
      }
    }
    const ended = (await h.map()).relay!.game!;
    assert.equal(ended.transfers, needed);
    assert.equal(ended.complete, true);
    assert.equal(ended.ended_at, h.clock.now().toISOString());
    assert.equal(ended.waiting_station_id, null);
    assert.equal(ended.calling_station_id, null);
    assert.equal(ended.waiting_until, null);
    assert.deepEqual(stationMessageRequest.parse(await sent.at(-1)!.json()), {
      station_id: needed! % 2 === 0 ? "B" : "A",
      lines: ["Relay done!", `${needed} of ${needed}`],
      beep: true,
    });
    h.clock.advanceSeconds(1);
    assert.deepEqual((await h.tap("B", "red")).lines, ["Sent!", "Blue to A"]);
  });
}

test("the map shows stations, the open call and completed progress without identifying groups or people", async () => {
  const h = await harness();
  assert.deepEqual(await h.map(), { relay: { stations: ["A", "B"], game: null } });
  await h.tap();
  assert.deepEqual(await h.map(), {
    relay: {
      stations: ["A", "B"],
      game: {
        started_at: "2026-11-13T08:00:00.000Z",
        transfers: 0,
        transfers_needed: 4,
        calling_station_id: "A",
        waiting_station_id: "B",
        waiting_until: "2026-11-13T08:00:20.000Z",
        ended_at: null,
        complete: false,
      },
    },
  });
  h.clock.advanceSeconds(5);
  await h.tap("B", "blue");
  const game = (await h.map()).relay!.game!;
  assert.equal(game.transfers, 1);
  assert.equal(game.waiting_station_id, "A");
  h.clock.advanceSeconds(20);
  assert.deepEqual((await h.map()).relay!.game, {
    ...game,
    calling_station_id: null,
    waiting_station_id: null,
    waiting_until: null,
  });
});

test("only a move resets the idle clock and the map ends an idle relay before the next tap", async () => {
  const h = await harness();
  await h.tap();
  h.clock.advanceSeconds(60);
  await h.tap("B", "blue");
  await h.tap("A", "unplaced");
  h.clock.advanceSeconds(59);
  assert.equal((await h.map()).relay!.game!.ended_at, null);
  h.clock.advanceSeconds(1);
  assert.deepEqual((await h.map()).relay!.game, {
    started_at: "2026-11-13T08:00:00.000Z",
    transfers: 0,
    transfers_needed: 4,
    calling_station_id: null,
    waiting_station_id: null,
    waiting_until: null,
    ended_at: "2026-11-13T08:02:00.000Z",
    complete: false,
  });
  assert.deepEqual((await h.tap("B", "red")).lines, ["Sent!", "Blue to A"]);
  assert.equal((await h.map()).relay!.game!.started_at, "2026-11-13T08:02:00.000Z");
});

test("a committed call sends a waiting message without waiting for its delivery", async () => {
  const requests: Request[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed: Promise<boolean> | undefined;
  const h = await harness(3, {
    send: async (input, init) => {
      committed = h.map().then((m) => m.relay!.game?.waiting_station_id === "B");
      requests.push(new Request(input, init));
      await gate;
      return Response.json({ delivered: true });
    },
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      h.tap(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Tap waited for station message")), 1000);
      }),
    ]);
    assert.equal(answer.status, "accepted");
    assert.equal(requests.length, 1);
    assert.equal(await committed, true);
    assert.deepEqual(await requests[0]!.json(), {
      station_id: "B",
      lines: ["Need Blue", "Tap here"],
      countdown: { seconds: 20, lines: ["Need Blue", "{s}s left"], ending: ["Missed it", ""] },
      beep: true,
    });
    assert.equal((await h.map()).relay!.game!.waiting_station_id, "B");
  } finally {
    clearTimeout(timeout);
    release();
  }
});

test("failed and dropped station messages leave transfers playable and only moves send messages", async () => {
  let sent = 0;
  const h = await harness(3, {
    send: async () => {
      sent++;
      if (sent % 2 === 1) throw new Error("No connection");
      return Response.json({ delivered: false });
    },
  });
  await h.tap();
  assert.equal(sent, 1);
  await h.tap("A", "blue");
  await h.tap("B", "red");
  await h.tap("B", "unplaced");
  assert.equal(sent, 1);
  assert.equal((await h.tap("B", "blue")).status, "accepted");
  assert.equal(sent, 2);
  assert.equal((await h.map()).relay!.game!.transfers, 1);
});

test("an ingest that rolls back sends no station message and starts no game", async () => {
  let sent = 0;
  const h = await harness(3, {
    rollback: true,
    send: async () => {
      sent++;
      return Response.json({ delivered: true });
    },
  });
  const res = await h.app.request("/geekykey/v1/taps", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      station_id: "A",
      taps: [{ client_tap_id: "rollback", user_id: "red", tapped_at: null }],
    }),
  });
  assert.equal(res.status, 500);
  assert.equal(sent, 0);
  assert.equal((await h.map()).relay!.game, null);
});

test("setup problems explain the missing station or group without starting a game", async () => {
  const h = await harness(1);
  const groups = await h.tap();
  assert.equal(groups.status, "cooldown");
  assert.deepEqual(groups.lines, ["Need 2 groups", "Tell organizer"]);
  assert.equal((await h.map()).relay!.game, null);
  await h.db
    .update(stations)
    .set({ disabledAt: h.clock.now().toISOString() })
    .where(eq(stations.id, "B"));
  const station = await h.tap();
  assert.equal(station.status, "cooldown");
  assert.deepEqual(station.lines, ["Relay needs", "2 stations"]);
  assert.deepEqual(await h.map(), { relay: { stations: ["A"], game: null } });
  await h.db.update(stations).set({ disabledAt: null });
  await h.db
    .insert(stations)
    .values({ id: "C", label: "C", game: "relay", apiKeyHash: "c".repeat(64) });
  assert.deepEqual((await h.tap()).lines, ["Relay needs", "2 stations"]);
});

test("the showcase offers Relay and its registered stations have the relay idle screen", async () => {
  const h = await harness();
  const app = testApp({ ORGANIZERS: "organizer" });
  const board = await app.request("/api/v1/admin/stations", {
    headers: { Cookie: await h.cookie("organizer") },
  });
  assert.equal(board.status, 200);
  const body = (await board.json()) as { games: { id: string; name: string }[] };
  screensSchemas.eventStationBoardResponseSchema.parse(body);
  assert.deepEqual(body.games, [
    { id: "passport", name: "Passport" },
    { id: "team_duels", name: "Team duels" },
    { id: "relay", name: "Relay" },
  ]);
  const registered = await app.request("/geekykey/v1/stations", {
    headers: { Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}` },
  });
  assert.equal(registered.status, 200);
  const stationList = stationsAnswer.parse(await registered.json());
  assert.ok(
    stationList.stations.every(
      (s) => JSON.stringify(s.idle_lines) === JSON.stringify(["Relay", "Tap to start"]),
    ),
  );
});

test("three groups pick among the others while two groups need no random choice", async () => {
  const choices: string[][] = [];
  const h = await harness(3, {
    pickGroup: (ids) => {
      choices.push([...ids]);
      return ids.at(-1)!;
    },
  });
  assert.deepEqual((await h.tap()).lines, ["Sent!", "Green to B"]);
  assert.deepEqual(choices, [["Blue", "Green"]]);
  assert.deepEqual((await h.tap("B", "green")).lines, ["Got it!", "Blue to A"]);
  assert.deepEqual(choices[1], ["Red", "Blue"]);
  await h.db.delete(groupMembers).where(eq(groupMembers.groupId, "Green"));
  h.clock.advanceSeconds(120);
  const two = harnessTwoGroupApp(h.clock.now);
  const res = await two.request("/geekykey/v1/taps", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      station_id: "A",
      taps: [{ client_tap_id: "two-groups", user_id: "red", tapped_at: null }],
    }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(tapsAnswer.parse(await res.json()).results[0]!.lines, ["Sent!", "Blue to B"]);
});

function harnessTwoGroupApp(now: () => Date) {
  return testApp(
    {},
    {
      now,
      games: ({ stationMessages }) => [
        {
          game: relayGame({
            stationMessages,
            pickGroup: () => {
              throw new Error("Two groups have no choice");
            },
          }),
          stations: "chosen",
          name: "Relay",
        },
      ],
    },
  );
}

test("a repeated tap completes its transfer once and sends its message once", async () => {
  let sent = 0;
  const h = await harness(3, {
    send: async () => {
      sent++;
      return Response.json({ delivered: true });
    },
  });
  await h.tap();
  await h.tap("B", "blue", "same-tap");
  const before = await h.map();
  assert.equal(before.relay!.game!.transfers, 1);
  assert.deepEqual(await h.tap("B", "blue", "same-tap"), {
    client_tap_id: "same-tap",
    status: "duplicate",
  });
  assert.deepEqual(await h.map(), before);
  assert.equal(sent, 2);
});

test("saved taps older than the transfer window count for no game and fresh saved taps use receipt time", async () => {
  const h = await harness();
  const answer = await h.tap("A", "red", "saved", "2026-11-13T07:59:39.999Z");
  assert.deepEqual(answer, { client_tap_id: "saved", status: "no_game" });
  assert.equal((await h.map()).relay!.game, null);
  assert.equal(
    (await h.tap("A", "red", "boundary", "2026-11-13T07:59:40.000Z")).status,
    "accepted",
  );
  assert.equal((await h.map()).relay!.game!.waiting_until, "2026-11-13T08:00:20.000Z");
});

test("the map authenticates readers and relay polling leaves the sixty-request user allowance intact", async () => {
  const h = await harness();
  assert.equal((await h.app.request("/api/v1/map/relay")).status, 401);
  assert.equal(
    (
      await h.app.request("/api/v1/map/relay", {
        headers: { Cookie: await h.cookie("participant") },
      })
    ).status,
    403,
  );
  const headers = { Cookie: await h.cookie() };
  for (let i = 0; i < 65; i++)
    assert.equal((await h.app.request("/api/v1/map/relay", { headers })).status, 200);
  for (let i = 0; i < 60; i++)
    assert.equal((await h.app.request("/api/v1/map", { headers })).status, 200);
  assert.equal((await h.app.request("/api/v1/map", { headers })).status, 429);
  assert.equal((await h.app.request("/api/v1/map/relay", { headers })).status, 200);
  assert.equal(
    (await h.app.request("/api/v1/map/relay", { headers: { Cookie: await h.cookie("organizer") } }))
      .status,
    200,
  );
  const noRelay = testApp({ MAP_SCREENS: "map" }, { games: () => [] });
  const absent = await noRelay.request("/api/v1/map/relay", { headers });
  assert.equal(absent.status, 200);
  assert.deepEqual(await absent.json(), { relay: null });
});

test("a batch judges taps by their effective time and returns each tap's own screen in request order", async () => {
  const h = await harness();
  const res = await h.app.request("/geekykey/v1/taps", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      station_id: "A",
      taps: [
        { client_tap_id: "later", user_id: "green", tapped_at: "2026-11-13T08:00:00.000Z" },
        { client_tap_id: "first", user_id: "red", tapped_at: "2026-11-13T07:59:55.000Z" },
        { client_tap_id: "first", user_id: "red", tapped_at: null },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const results = tapsAnswer.parse(await res.json()).results;
  assert.deepEqual(
    results.map((r) => r.status),
    ["cooldown", "accepted", "duplicate"],
  );
  assert.deepEqual(results[0]!.lines, ["Still waiting", "Blue to B"]);
  assert.deepEqual(results[1]!.lines, ["Sent!", "Blue to B"]);
});

test("simultaneous taps at the two stations share one relay without deadlocking", async () => {
  const h = await harness();
  const answers = await Promise.all([h.tap("A", "red"), h.tap("B", "red")]);
  assert.deepEqual(answers.map((a) => a.status).sort(), ["accepted", "cooldown"]);
  assert.equal((await h.map()).relay!.game!.transfers, 0);
});

test("relay taps give no points, stamps, connections or avatar rewards", async () => {
  const h = await harness();
  await h.tap();
  await h.tap("B", "blue");
  const res = await h.app.request("/api/v1/me", { headers: { Cookie: await h.cookie("red") } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { points: number; stamps: unknown[]; connections: unknown[] };
  screensSchemas.meResponseSchema.parse(body);
  assert.equal(body.points, 0);
  assert.deepEqual(body.stamps, []);
  assert.deepEqual(body.connections, []);
});

test("station screens shorten names, remove accents and use readable group and booth fallbacks", async () => {
  const messages: Request[] = [];
  const h = await harness(3, {
    send: async (input, init) => {
      messages.push(new Request(input, init));
      return Response.json({ delivered: true });
    },
  });
  await h.db
    .update(participantGroups)
    .set({ name: "Blúe has a very long name" })
    .where(eq(participantGroups.id, "Blue"));
  await h.db.update(stations).set({ booth: "B1234567890" }).where(eq(stations.id, "B"));
  assert.deepEqual((await h.tap()).lines, ["Sent!", "B to B1234567890"]);
  h.clock.advanceSeconds(120);
  await h.db
    .update(participantGroups)
    .set({ name: "小明" })
    .where(eq(participantGroups.id, "Blue"));
  await h.db.update(stations).set({ booth: "小明" }).where(eq(stations.id, "B"));
  assert.deepEqual((await h.tap()).lines, ["Sent!", "Group 2 to other"]);
  h.clock.advanceSeconds(120);
  await h.db.update(participantGroups).set({ name: "{s}" }).where(eq(participantGroups.id, "Blue"));
  await h.db.update(stations).set({ booth: null }).where(eq(stations.id, "B"));
  const braces = await h.tap();
  assert.deepEqual(braces.lines, ["Sent!", "{s} to other"]);
  assert.deepEqual(braces.countdown!.lines, ["(s) to other", "{s}s left"]);
  for (const message of messages) {
    stationMessageRequest.parse(await message.json());
  }
});

test("a missed call stays in the record and only completed transfers count toward the fixed target", async () => {
  const h = await harness();
  await h.tap();
  h.clock.advanceSeconds(1);
  await h.tap("B", "blue");
  h.clock.advanceSeconds(20);
  await h.tap("A", "red");
  const missed = (await h.map()).relay!.game!;
  assert.equal(missed.transfers, 1);
  assert.equal(missed.waiting_station_id, null);
  await h.db.delete(groupMembers).where(eq(groupMembers.groupId, "Green"));
  await h.tap("B", "blue");
  assert.equal((await h.map()).relay!.game!.transfers_needed, 4);
  h.clock.advanceSeconds(1);
  await h.tap("A", "red");
  assert.equal((await h.map()).relay!.game!.transfers, 2);
  const { relayTransfers, relayGames } = await import("./schema.ts");
  const calls = await h.db.select().from(relayTransfers);
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((c) => c.completedAt === null).length, 2);
  assert.ok(
    calls.some(
      (c) =>
        c.calledAt === "2026-11-13T08:00:01.000Z" &&
        c.closesAt === "2026-11-13T08:00:21.000Z" &&
        c.completedAt === null,
    ),
  );
  assert.equal((await h.db.select().from(relayGames))[0]!.groupsPlaying, 3);
});

test("factory rules override both targets and both clocks and countdown seconds round up", async () => {
  const h = await harness(3, {
    rules: { transferMs: 1500, idleMs: 5000, manyGroupTransfers: 1, twoGroupTransfers: 2 },
  });
  assert.equal((await h.tap()).countdown!.seconds, 2);
  h.clock.advanceSeconds(0.75);
  assert.equal((await h.tap()).countdown!.seconds, 1);
  assert.equal((await h.tap("B", "blue")).complete, true);
  await h.db.delete(groupMembers).where(eq(groupMembers.groupId, "Green"));
  h.clock.advanceSeconds(0.001);
  await h.tap();
  assert.equal((await h.map()).relay!.game!.transfers_needed, 2);
  h.clock.advanceSeconds(5);
  assert.equal((await h.map()).relay!.game!.ended_at, "2026-11-13T08:00:05.751Z");
});

test("an oversized booth keeps a group initial and every screen still fits the station", async () => {
  const h = await harness();
  await h.db.update(stations).set({ booth: "B12345678901234567890" }).where(eq(stations.id, "B"));
  assert.deepEqual((await h.tap()).lines, ["Sent!", "B to B1234567890"]);
  await h.db.update(stations).set({ booth: "A12345678901234567890" }).where(eq(stations.id, "A"));
  assert.deepEqual((await h.tap("B", "red")).lines, ["Not you", "Ask at A12345678"]);
});

test("the map lists enabled relay stations in creation order even when the setup cannot play", async () => {
  const h = await harness();
  await h.db.insert(stations).values({
    id: "oldest",
    label: "Oldest",
    game: "relay",
    apiKeyHash: "d".repeat(64),
    createdAt: "2026-11-12T07:00:00.000Z",
  });
  assert.deepEqual((await h.map()).relay!.stations, ["oldest", "A", "B"]);
  await h.db.update(stations).set({ game: null });
  assert.deepEqual(await h.map(), { relay: { stations: [], game: null } });
});
