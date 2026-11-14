import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  type StationMessageRequest,
  stationMessageRequest,
  stationsAnswer,
  tapsAnswer,
} from "@geekykey/handoff";
import { test } from "vitest";
import { setConnectAcross } from "../../event/event-settings.ts";
import { groupMembers, participantGroups, stations, taps, users } from "../../event/schema.ts";
import {
  fakeClock,
  screensSchemas,
  testApp,
  testDb,
  TEST_EVENT_SERVICE_KEY,
} from "../../test-helpers.ts";
import { answersGame } from "../connections/answers.ts";
import { connectionsGame } from "../connections/connections.ts";
import { openSeatGame, openSeatRequests } from "./open-seat.ts";
import { openSeats } from "./schema.ts";

// The open seat (BAC-190): a tap at an open seat station opens a seat for 60 seconds, the
// other open seat stations say where it is, and someone from another group, or with none,
// takes it at the same station, which sends the sitter a connection request.

/**
 * Three open seat stations at booths A, B and C, and five named people: ana and amy in the Red
 * group, ben in Blue, and cal and dee in no group.
 */
async function harness({ send }: { send?: (message: StationMessageRequest) => boolean } = {}) {
  const clock = fakeClock("2026-11-14T08:00:00.000Z");
  const db = testDb();
  await db.insert(stations).values(
    ["A", "B", "C"].map((booth, i) => ({
      id: booth,
      label: `Station ${booth}`,
      booth,
      game: "open_seat",
      apiKeyHash: booth.toLowerCase().repeat(64),
      createdAt: `2026-11-14T07:00:0${i}.000Z`,
    })),
  );
  for (const [id, displayName] of [
    ["ana", "Ana Lim"],
    ["amy", "Amy"],
    ["ben", "Ben Tan"],
    ["cal", "Cal"],
    ["dee", "Dee"],
    ["org", "Organizer"],
  ] as const) {
    await db.insert(users).values({ id, displayName });
  }
  for (const [i, [group, members]] of (
    [
      ["Red", ["ana", "amy"]],
      ["Blue", ["ben"]],
    ] as const
  ).entries()) {
    await db
      .insert(participantGroups)
      .values({ id: group, name: group, tags: [], createdAt: `2026-11-14T07:00:0${i}.000Z` });
    for (const userId of members) {
      await db
        .insert(groupMembers)
        .values({ userId, groupId: group, joinedAt: clock.now().toISOString() });
    }
  }
  const messages: StationMessageRequest[] = [];
  const answers = answersGame([]);
  const connections = connectionsGame(answers, { requestRules: [openSeatRequests] });
  const app = testApp(
    { GEEKYKEY_SERVICE_URL: "https://key.example", ORGANIZERS: "org" },
    {
      now: clock.now,
      answers,
      connections,
      send: async (_url, init) => {
        const message = stationMessageRequest.parse(JSON.parse(String(init?.body)));
        messages.push(message);
        return Response.json({ delivered: send ? send(message) : true });
      },
      games: (deps) => [
        {
          game: openSeatGame({ ...deps, pickPrompt: (prompts) => prompts[0]! }),
          stations: "chosen",
          name: "Open seat",
        },
      ],
    },
  );

  /** `user` taps their token at `station`, as the GeekyKey Service hands it on (11.2). */
  async function tap(station: string, user: string, tappedAt: string | null = null) {
    const res = await app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: station,
        taps: [{ client_tap_id: crypto.randomUUID(), user_id: user, tapped_at: tappedAt }],
      }),
    });
    assert.equal(res.status, 200);
    const answer = tapsAnswer.parse(await res.json()).results[0]!;
    // Station messages go after the ingest commits, without the answer waiting for them.
    await new Promise((resolve) => setTimeout(resolve, 20));
    return answer;
  }

  const cookies = new Map<string, string>();
  /** A session cookie for `user`, from dev-login. */
  async function cookie(user: string) {
    if (!cookies.has(user)) {
      const res = await app.request("/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user }),
      });
      assert.equal(res.status, 204);
      cookies.set(user, res.headers.get("Set-Cookie")!.split(";")[0]!);
    }
    return cookies.get(user)!;
  }

  /** GET /api/v1/me for `user`. */
  async function me(user: string) {
    const res = await app.request("/api/v1/me", { headers: { Cookie: await cookie(user) } });
    assert.equal(res.status, 200);
    const body: unknown = await res.json();
    // The dashboard's own check of /me still takes it with `open_seat` in it.
    screensSchemas.meResponseSchema.parse(body);
    return body as {
      points: number;
      open_seat?: unknown;
      connection_requests: { id: string; display_name: string }[];
      connections: { display_name: string }[];
    };
  }

  /** `user` accepts or declines a request on their dashboard (8.10). */
  async function answer(user: string, requestId: string, how: "accept" | "decline") {
    return app.request(`/api/v1/me/connection-requests/${requestId}/${how}`, {
      method: "POST",
      headers: { Cookie: await cookie(user) },
    });
  }

  /** `user` taps `owner`'s token with their phone, as the GeekyKey Service hands it on (11.10). */
  async function meet(user: string, owner: string) {
    const res = await app.request("/geekykey/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: user, user_kind: null, owner_id: owner, owner_kind: null }),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { status: string }).status;
  }

  /** GET /api/v1/map's stations, for an organizer. */
  async function map() {
    const res = await app.request("/api/v1/map", { headers: { Cookie: await cookie("org") } });
    assert.equal(res.status, 200);
    return ((await res.json()) as { stations: Record<string, unknown>[] }).stations;
  }

  return { app, db, clock, messages, tap, me, answer, meet, map };
}

test("a tap opens a seat with a countdown, and the other stations say where it is", async () => {
  const h = await harness();
  const answer = await h.tap("A", "ana");
  assert.equal(answer.status, "accepted");
  assert.deepEqual(answer.lines, ["Seat open", "Wait here"]);
  assert.deepEqual(answer.countdown, {
    seconds: 60,
    lines: ["Seat open", "Wait here {s}s"],
    ending: ["Open seat", "Tap to sit"],
  });
  assert.deepEqual(
    h.messages.sort((a, b) => a.station_id.localeCompare(b.station_id)),
    ["B", "C"].map((station_id) => ({
      station_id,
      lines: ["Open seat at A", "Tap there"],
      countdown: {
        seconds: 60,
        lines: ["Open seat at A", "Tap there {s}s"],
        ending: ["Open seat", "Tap to sit"],
      },
      beep: true,
    })),
  );
});

test("someone from another group takes the seat, gets both names, then a prompt", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  h.messages.length = 0;
  h.clock.advanceSeconds(10);
  const answer = await h.tap("A", "ben");
  assert.equal(answer.status, "accepted");
  assert.deepEqual(answer.lines, ["Seat taken!", "Ana & Ben"]);
  assert.equal(answer.countdown, undefined);
  const byStation = new Map(h.messages.map((m) => [m.station_id, m]));
  assert.deepEqual(byStation.get("A"), {
    station_id: "A",
    lines: ["What are you", "building?"],
    countdown: {
      seconds: 20,
      lines: ["What are you", "building?"],
      ending: ["Open seat", "Tap to sit"],
    },
  });
  for (const other of ["B", "C"]) {
    assert.deepEqual(byStation.get(other), { station_id: other, lines: ["Seat taken"] });
  }
});

test("taking a seat sends the sitter one request from the taker, which Accept connects", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  await h.tap("A", "ben");
  const sitter = await h.me("ana");
  assert.equal(sitter.connection_requests.length, 1);
  assert.equal(sitter.connection_requests[0]!.display_name, "Ben Tan");
  assert.equal((await h.me("ben")).connection_requests.length, 0);
  const res = await h.answer("ana", sitter.connection_requests[0]!.id, "accept");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "connected" });
  assert.deepEqual(
    (await h.me("ben")).connections.map((c) => c.display_name),
    ["Ana Lim"],
  );
});

test("Decline takes a seat's request away, as for any request", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  await h.tap("A", "cal");
  const [request] = (await h.me("ana")).connection_requests;
  assert.equal((await h.answer("ana", request!.id, "decline")).status, 204);
  assert.deepEqual((await h.me("ana")).connection_requests, []);
  assert.deepEqual((await h.me("ana")).connections, []);
});

test("someone in the sitter's group is refused, and the seat stays open for someone else", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  const refused = await h.tap("A", "amy");
  assert.equal(refused.status, "cooldown");
  assert.deepEqual(refused.lines, ["Same team", "Find another"]);
  assert.deepEqual((await h.me("ana")).connection_requests, []);
  assert.deepEqual((await h.tap("A", "dee")).lines, ["Seat taken!", "Ana & Dee"]);
});

test("someone already connected with the sitter is refused, and the seat stays open", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  await h.tap("A", "ben");
  const [request] = (await h.me("ana")).connection_requests;
  await h.answer("ana", request!.id, "accept");
  await h.tap("A", "ana");
  const refused = await h.tap("A", "ben");
  assert.equal(refused.status, "cooldown");
  assert.deepEqual(refused.lines, ["Already met", "Find another"]);
  assert.equal((await h.tap("A", "cal")).status, "accepted");
});

test("the sitter tapping again keeps their seat and its countdown", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  h.clock.advanceSeconds(25);
  const again = await h.tap("A", "ana");
  assert.equal(again.status, "cooldown");
  assert.deepEqual(again.lines, ["Seat open", "Wait here"]);
  assert.deepEqual(again.countdown, {
    seconds: 35,
    lines: ["Seat open", "Wait here {s}s"],
    ending: ["Open seat", "Tap to sit"],
  });
  h.clock.advanceSeconds(30);
  assert.deepEqual((await h.tap("A", "ben")).lines, ["Seat taken!", "Ana & Ben"]);
});

test("one seat is open at a time: a tap at another station says where it is", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  h.clock.advanceSeconds(20);
  for (const user of ["ben", "ana"]) {
    const elsewhere = await h.tap("B", user);
    assert.equal(elsewhere.status, "cooldown");
    assert.deepEqual(elsewhere.lines, ["Open seat at A", "Tap there"]);
    assert.deepEqual(elsewhere.countdown, {
      seconds: 40,
      lines: ["Open seat at A", "Tap there {s}s"],
      ending: ["Open seat", "Tap to sit"],
    });
  }
});

test("a new seat can open as soon as the last is taken", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  await h.tap("A", "ben");
  h.messages.length = 0;
  const next = await h.tap("B", "cal");
  assert.deepEqual(next.lines, ["Seat open", "Wait here"]);
  assert.deepEqual(h.messages.map((m) => m.station_id).sort(), ["A", "C"]);
});

test("a seat nobody takes closes after 60 seconds, and a tap then opens a new one", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  h.messages.length = 0;
  h.clock.advanceSeconds(60);
  const late = await h.tap("A", "ben");
  assert.equal(late.status, "accepted");
  assert.deepEqual(late.lines, ["Seat open", "Wait here"]);
  assert.deepEqual((await h.me("ana")).connection_requests, []);
});

test("the seat can still be taken at its station when every station message is dropped", async () => {
  const h = await harness({ send: () => false });
  await h.tap("A", "ana");
  assert.deepEqual((await h.tap("A", "ben")).lines, ["Seat taken!", "Ana & Ben"]);
  assert.equal((await h.me("ana")).connection_requests.length, 1);
});

test("someone without a name can neither open nor take a seat", async () => {
  const h = await harness();
  await h.db.insert(users).values({ id: "guest", displayName: "Guest" });
  const open = await h.tap("A", "guest");
  assert.equal(open.status, "cooldown");
  assert.deepEqual(open.lines, ["Finish setup", "on your phone"]);
  await h.tap("A", "ana");
  const take = await h.tap("A", "guest");
  assert.equal(take.status, "cooldown");
  assert.deepEqual(take.lines, ["Finish setup", "on your phone"]);
  assert.deepEqual((await h.me("ana")).connection_requests, []);
});

test("a saved tap made over 10 seconds before it arrives opens and takes nothing", async () => {
  const h = await harness();
  const saved = await h.tap("A", "ana", "2026-11-14T07:59:40.000Z");
  assert.equal(saved.status, "no_game");
  assert.equal(saved.lines, undefined);
  await h.tap("A", "ana");
  h.clock.advanceSeconds(70);
  // ben tapped while ana's seat was open, but the station sent it after the seat closed.
  const late = await h.tap("A", "ben", "2026-11-14T08:00:30.000Z");
  assert.equal(late.status, "no_game");
  assert.deepEqual((await h.me("ana")).connection_requests, []);
});

test("the seat's taps record the game and give no points", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  await h.tap("A", "ben");
  const stored = await h.db.select({ game: taps.game, status: taps.status }).from(taps);
  assert.deepEqual(
    stored.map((t) => `${t.game} ${t.status}`),
    ["open_seat accepted", "open_seat accepted"],
  );
  assert.equal((await h.me("ana")).points, 0);
  assert.equal((await h.me("ben")).points, 0);
});

test("a seat's request is judged by the seat's rule on Accept, not the Groups screen's", async () => {
  const h = await harness();
  // The Groups screen's rule would refuse these two, who have no kinds, by `no_kind`.
  await h.tap("A", "ana");
  await h.tap("A", "cal");
  assert.equal(await h.meet("dee", "cal"), "no_kind");
  const [request] = (await h.me("ana")).connection_requests;
  const res = await h.answer("ana", request!.id, "accept");
  assert.deepEqual(await res.json(), { status: "connected" });
});

test("a seat's request is refused on Accept once the two are in one group", async () => {
  const h = await harness();
  await setConnectAcross(h.db, "groups");
  await h.tap("A", "ana");
  await h.tap("A", "cal");
  await h.db
    .insert(groupMembers)
    .values({ userId: "cal", groupId: "Red", joinedAt: h.clock.now().toISOString() });
  const [request] = (await h.me("ana")).connection_requests;
  const res = await h.answer("ana", request!.id, "accept");
  assert.deepEqual(await res.json(), { status: "same_group" });
  assert.deepEqual((await h.me("ana")).connection_requests, []);
});

test("the sitter tapping the taker's token accepts a seat's request by the seat's rule", async () => {
  const h = await harness();
  await setConnectAcross(h.db, "groups");
  await h.tap("A", "ana");
  await h.tap("A", "cal");
  // cal has no group, which the Groups screen's rule refuses by `no_group`.
  assert.equal(await h.meet("ana", "cal"), "connected");
});

test("/me gives the sitter and the taker their seat, and nobody else", async () => {
  const h = await harness();
  assert.equal((await h.me("ana")).open_seat, null);
  await h.tap("B", "ana");
  h.clock.advanceSeconds(5);
  assert.deepEqual((await h.me("ana")).open_seat, {
    status: "open",
    role: "sitter",
    station_id: "B",
    booth: "B",
    opened_at: "2026-11-14T08:00:00.000Z",
    closes_at: "2026-11-14T08:01:00.000Z",
    taken_at: null,
    other_display_name: null,
    prompt: null,
  });
  await h.tap("B", "ben");
  const taken = {
    status: "taken",
    station_id: "B",
    booth: "B",
    opened_at: "2026-11-14T08:00:00.000Z",
    closes_at: "2026-11-14T08:01:00.000Z",
    taken_at: "2026-11-14T08:00:05.000Z",
    prompt: "What are you building?",
  };
  assert.deepEqual((await h.me("ana")).open_seat, {
    ...taken,
    role: "sitter",
    other_display_name: "Ben Tan",
  });
  assert.deepEqual((await h.me("ben")).open_seat, {
    ...taken,
    role: "taker",
    other_display_name: "Ana Lim",
  });
  assert.equal((await h.me("cal")).open_seat, null);
});

test("/me says a seat nobody took is closed once its 60 seconds end", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  h.clock.advanceSeconds(60);
  assert.equal(((await h.me("ana")).open_seat as { status: string }).status, "closed");
});

test("the map says which station has an open seat and when it closes, and nothing else", async () => {
  const h = await harness();
  const seatOn = async () =>
    Object.fromEntries((await h.map()).map((s) => [s.station_id, s.open_seat_until]));
  assert.deepEqual(await seatOn(), { A: null, B: null, C: null });
  await h.tap("C", "ana");
  assert.deepEqual(await seatOn(), { A: null, B: null, C: "2026-11-14T08:01:00.000Z" });
  await h.tap("C", "ben");
  assert.deepEqual(await seatOn(), { A: null, B: null, C: null });
  h.clock.advanceSeconds(1);
  await h.tap("A", "cal");
  assert.deepEqual(await seatOn(), { A: "2026-11-14T08:01:01.000Z", B: null, C: null });
  h.clock.advanceSeconds(60);
  assert.deepEqual(await seatOn(), { A: null, B: null, C: null });
});

test("the record keeps each seat's station, times, and whether its request was accepted", async () => {
  const h = await harness();
  await h.tap("A", "ana");
  h.clock.advanceSeconds(5);
  await h.tap("A", "ben");
  const [request] = (await h.me("ana")).connection_requests;
  h.clock.advanceSeconds(30);
  await h.answer("ana", request!.id, "accept");
  await h.tap("B", "cal");
  h.clock.advanceSeconds(5);
  await h.tap("B", "dee");
  h.clock.advanceSeconds(1);
  await h.tap("C", "amy");
  const record = await h.db
    .select({
      station: openSeats.stationId,
      openedAt: openSeats.openedAt,
      takenAt: openSeats.takenAt,
      acceptedAt: openSeats.acceptedAt,
    })
    .from(openSeats)
    .orderBy(openSeats.openedAt);
  assert.deepEqual(record, [
    {
      station: "A",
      openedAt: "2026-11-14T08:00:00.000Z",
      takenAt: "2026-11-14T08:00:05.000Z",
      acceptedAt: "2026-11-14T08:00:35.000Z",
    },
    {
      station: "B",
      openedAt: "2026-11-14T08:00:35.000Z",
      takenAt: "2026-11-14T08:00:40.000Z",
      acceptedAt: null,
    },
    { station: "C", openedAt: "2026-11-14T08:00:41.000Z", takenAt: null, acceptedAt: null },
  ]);
});

test("the showcase offers Open seat, and its stations get the open seat's idle screen", async () => {
  const h = await harness();
  const app = testApp({ ORGANIZERS: "org" });
  const login = await app.request("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "org" }),
  });
  const board = await app.request("/api/v1/admin/stations", {
    headers: { Cookie: login.headers.get("Set-Cookie")!.split(";")[0]! },
  });
  const body = (await board.json()) as { games: { id: string; name: string }[] };
  screensSchemas.eventStationBoardResponseSchema.parse(body);
  assert.deepEqual(body.games.at(-1), { id: "open_seat", name: "Open seat" });
  const registered = await h.app.request("/geekykey/v1/stations", {
    headers: { Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}` },
  });
  const { stations: listed } = stationsAnswer.parse(await registered.json());
  assert.deepEqual(
    listed.map((s) => s.idle_lines),
    [
      ["Open seat", "Tap to sit"],
      ["Open seat", "Tap to sit"],
      ["Open seat", "Tap to sit"],
    ],
  );
});

test("a station with a long booth name, or none, still says where the seat is", async () => {
  const h = await harness();
  await h.db.update(stations).set({ booth: "Robotics Corner" }).where(eq(stations.id, "A"));
  await h.db.update(stations).set({ booth: null }).where(eq(stations.id, "B"));
  await h.tap("A", "ana");
  assert.deepEqual(
    h.messages.find((m) => m.station_id === "B")?.countdown?.lines,
    ["Seat at Robotics C", "Tap there {s}s"].map((line) => line.slice(0, 16)),
  );
  assert.deepEqual((await h.tap("B", "ben")).lines, ["Seat at Robotics", "Tap there"]);
  h.clock.advanceSeconds(60);
  h.messages.length = 0;
  await h.tap("B", "ben");
  assert.deepEqual(
    h.messages.find((m) => m.station_id === "A")?.lines,
    ["Seat at Station B", "Tap there"].map((line) => line.slice(0, 16)),
  );
});
