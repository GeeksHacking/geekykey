import { describe, expect, it, onTestFinished, vi } from "vitest";

import { ApiError, AUTH_ERROR_EVENT } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import {
  EXPORT_CSV_COLUMNS,
  GROUPS_EXPORT_CSV_COLUMNS,
  type SplitGroupsRequest,
} from "@/api/types";

function client() {
  return createMockClient({ latencyMs: [0, 0], storage: null });
}

/** The export's lines, split on the CRLF that ends each one (agreement 9.6). */
async function exportLines(api: ReturnType<typeof client>) {
  const text = await (await api.exportCsv()).text();
  expect(text.endsWith("\r\n")).toBe(true);
  return text.slice(0, -2).split("\r\n");
}

async function expectApiError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
  expect((error as ApiError).status).toBe(status);
}

describe("the mock's error statuses", () => {
  it("answers each code with the status agreement section 2 gives it", async () => {
    // The mock is the only error source the screens see in development, so a wrong status
    // here is a wrong status on screen. The three station-facing codes are absent on
    // purpose: they answer a station request, and no screen calls one.
    const expected: Record<string, number> = {
      validation_failed: 400,
      unauthenticated: 401,
      // The two login errors, which the login screen shows (agreement 7.2).
      invalid_token: 401,
      // The login link that failed (agreement 7.4).
      invalid_login_link: 401,
      forbidden: 403,
      not_found: 404,
      answers_fixed: 409,
      rate_limited: 429,
      event_service_unavailable: 503,
      claims_unavailable: 503,
      login_unavailable: 503,
      service_unavailable: 503,
      internal_error: 500,
    };

    for (const [code, status] of Object.entries(expected)) {
      const api = client();
      api.mock.setSession(SEEDED_ORGANIZER_ID);
      api.mock.failNext(code as Parameters<typeof api.mock.failNext>[0]);

      const error = await api.me().catch((e: unknown) => e);

      expect(error, `${code} did not reject`).toBeInstanceOf(ApiError);
      expect((error as ApiError).code, code).toBe(code);
      expect((error as ApiError).status, code).toBe(status);
    }
  });
});

describe("sessions and roles", () => {
  it("answers /me with 401 when nobody is signed in", async () => {
    await expectApiError(client().me(), "unauthenticated", 401);
  });

  it("signs in as the seeded participant when the login comes from Firebase", async () => {
    // The mock has no Firebase to ask, so it picks the account the fixtures were built
    // around, and the screens read /me as they do live.
    const api = client();

    await api.firebaseLogin("id-token");

    await expect(api.me()).resolves.toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("signs in as the seeded participant with the mock's login link", async () => {
    // The mock has no GeekyKey Service to make a real link, so `#login=mock` stands in for
    // one, and the screens read /me afterwards as they do live.
    const api = client();

    await api.loginLink("mock");

    await expect(api.me()).resolves.toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("signs in as a guest with no name of their own with `#login=guest`", async () => {
    // A guest reaches the Event screens from the GeekyKey screens' event buttons, so the
    // prompt for a name (agreement 8.1) is developed through a login link too.
    const api = client();

    await api.loginLink("guest");

    await expect(api.me()).resolves.toMatchObject({
      user: { display_name: "Guest", role: "participant", has_name: false },
      recent_taps: [],
    });
  });

  it("refuses any other login link and keeps the session it had", async () => {
    // Agreement 7.4: a link that fails leaves the existing session as it was.
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    await expectApiError(api.loginLink("eyJ2IjoxfQ.c2ln"), "invalid_login_link", 401);

    await expect(api.me()).resolves.toMatchObject({ user: { id: SEEDED_ORGANIZER_ID } });
  });

  it("gives participants 403 on organiser endpoints", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await expectApiError(api.listStationBoard(), "forbidden", 403);
  });

  it("returns a stamp slot for each passport station, in the order settings were added", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const me = await api.me();
    // "Info Desk" is the disabled fixture. It keeps its slot and its stamps (agreement
    // 9.2), and its settings were added last, so it comes last.
    expect(me.stamps.map((s) => s.name)).toEqual([
      "Cloud Sponsor",
      "3D Printing Booth",
      "Mentor Lounge",
      "Careers Corner",
      "Info Desk",
    ]);
    expect(me.stamps.some((s) => s.earned_at === null)).toBe(true);
    expect(me.stamps.some((s) => s.earned_at !== null)).toBe(true);
    expect(me.recent_taps.length).toBeGreaterThan(0);
  });

  it("answers the map to an organizer only, stamp slots first, with counts and no names", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await expectApiError(api.map(), "forbidden", 403);

    await api.devLogin(SEEDED_ORGANIZER_ID);
    const { stations } = await api.map();
    expect(stations.map((s) => s.name)).toEqual([
      "Cloud Sponsor",
      "3D Printing Booth",
      "Mentor Lounge",
      "Careers Corner",
      "Info Desk",
      null,
      null,
    ]);
    expect(stations.find((s) => s.name === "Info Desk")).toMatchObject({
      disabled: true,
      booth: "C1",
    });
    expect(stations.slice(5).every((s) => s.game === null)).toBe(true);
  });

  it("grows the map's web over a few polls", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    const first = (await api.map()).connections;
    const second = (await api.map()).connections;

    expect(first?.count).toBeGreaterThan(0);
    expect(second?.count).toBe((first?.count ?? 0) + 1);
    expect(second?.links).toHaveLength(second?.count ?? 0);
  });

  it("counts a cooldown tap in the map's taps, as 9.10 does", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const before = (await api.map()).stations[1]?.taps ?? 0;
    const stationId = (await api.map()).stations[1]?.station_id ?? "";
    await api.createFallbackTap({ station_id: stationId, user_id: "u_7f3a" });
    await api.createFallbackTap({ station_id: stationId, user_id: "u_7f3a" });
    expect((await api.map()).stations[1]?.taps).toBe(before + 2);
  });

  it("gives a tap at a station without passport settings no_game and a null name", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const me = await api.me();
    expect(me.recent_taps[0]).toMatchObject({ station_name: null, status: "no_game" });
  });
});

describe("the auth error the session provider hears", () => {
  function listen(): unknown[] {
    const heard: unknown[] = [];
    const onAuthError = (event: Event) => heard.push((event as CustomEvent).detail);
    window.addEventListener(AUTH_ERROR_EVENT, onAuthError);
    onTestFinished(() => window.removeEventListener(AUTH_ERROR_EVENT, onAuthError));
    return heard;
  }

  it("is not published when GET /me fails, as the live client does", async () => {
    const heard = listen();
    const api = client();

    await expectApiError(api.me(), "unauthenticated", 401);
    api.mock.failNext("forbidden");
    await expectApiError(api.me(), "forbidden", 403);

    expect(heard).toEqual([]);
  });

  it("is published when any other call fails", async () => {
    const heard = listen();

    await expectApiError(client().listStationBoard(), "unauthenticated", 401);

    expect(heard).toHaveLength(1);
  });

  it("keeps each call's own choice when calls overlap", async () => {
    // Both calls wait out the latency together, so the board's call starts while /me's waits.
    const heard = listen();
    const api = createMockClient({ latencyMs: [5, 5], storage: null });

    await Promise.allSettled([api.me(), api.listStationBoard()]);

    expect(heard).toHaveLength(1);
  });
});

describe("connections in /me (agreement 0.13 draft, 8.1)", () => {
  async function meOfParticipant() {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    return api.me();
  }

  it("gives a new connection, one with `shared` arrived, and one with no match", async () => {
    const { connections } = await meOfParticipant();

    expect(connections.map(({ match }) => match)).toEqual([60, 80, null]);
    expect(connections[0]?.shared).toBeNull();
    expect(connections[1]?.shared).toEqual(["drink", "hours", "superpower", "weekend"]);
    expect(connections[2]?.shared).toEqual([]);
  });

  it("lists connections newest first", async () => {
    const { connections } = await meOfParticipant();

    const times = connections.map(({ connected_at }) => connected_at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("gives what a new connection shares once its 2 minutes are up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      await api.devLogin(SEEDED_PARTICIPANT_ID);
      expect((await api.me()).connections[0]?.shared).toBeNull();

      vi.setSystemTime(Date.now() + 2 * 60_000);

      expect((await api.me()).connections[0]?.shared).toEqual(["drink", "school", "weekend"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds a point for each connection (section 4)", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const before = (await api.me()).points;

    const participant = api.mock.data.users.find((user) => user.id === SEEDED_PARTICIPANT_ID);
    if (!participant) throw new Error("The fixtures have no participant");
    participant.connections = [];

    expect((await api.me()).points).toBe(before - 3);
  });
});

describe("the name the event shows (agreement 8.7)", () => {
  it("saves the trimmed name, answers the user, and counts it as their own", async () => {
    const api = client();
    await api.loginLink("guest");

    const answer = await api.updateMe({ display_name: "  Mei Ling  " });

    expect(answer).toEqual({
      user: {
        id: SEEDED_GUEST_ID,
        display_name: "Mei Ling",
        role: "participant",
        has_name: true,
        answers: {},
        bio: null,
        contact_line: null,
      },
    });
    await expect(api.me()).resolves.toMatchObject({ user: answer.user });
  });

  it("counts a name the user sets as their own, even Guest", async () => {
    const api = client();
    await api.loginLink("guest");

    await api.updateMe({ display_name: "Guest" });

    await expect(api.me()).resolves.toMatchObject({ user: { has_name: true } });
  });

  it("counts code points, so 30 emoji fit and 31 letters do not", async () => {
    // Each of these emoji is two UTF-16 units, so a .length check would refuse them.
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expect(api.updateMe({ display_name: "🦊".repeat(30) })).resolves.toBeDefined();

    const refused = await api.updateMe({ display_name: "a".repeat(31) }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).code).toBe("validation_failed");
    expect((refused as ApiError).issues?.[0]?.path).toEqual(["display_name"]);
  });

  it("refuses a name that is blank once trimmed and leaves the name as it was", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expectApiError(api.updateMe({ display_name: "   " }), "validation_failed", 400);

    await expect(api.me()).resolves.toMatchObject({
      user: { display_name: "Alex Tan", has_name: true },
    });
  });

  it("refuses a name someone else has, whatever its capitals, and leaves everything as it was", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const before = (await api.me()).user;
    await expectApiError(
      api.updateMe({ display_name: " priya RAMAN ", bio: "Kept out" }),
      "name_taken",
      409,
    );
    await expect(api.me()).resolves.toMatchObject({ user: before });
  });

  it("lets a user save their own name again, with different capitals", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await expect(api.updateMe({ display_name: "ALEX TAN" })).resolves.toMatchObject({
      user: { display_name: "ALEX TAN" },
    });
  });

  it("answers 401 when nobody is signed in", async () => {
    await expectApiError(client().updateMe({ display_name: "Alex" }), "unauthenticated", 401);
  });
});

describe("the answers game (agreement 0.13)", () => {
  const connection = {
    connected_at: "2026-11-12T08:12:30.000Z",
    display_name: "Mei Lin",
    bio: null,
    contact_line: null,
    kind: "B",
    match: 60,
    shared: null,
    shared_at: "2026-11-12T08:14:30.000Z",
  };

  function connect(api: ReturnType<typeof client>, userId: string = SEEDED_GUEST_ID) {
    const user = api.mock.data.users.find((candidate) => candidate.id === userId);
    if (!user) throw new Error("The seeded user is missing");
    user.connections = [connection];
  }

  it("gives the same 5 questions, and no answers before any", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);

    const me = await api.me();

    expect(me.questions).toHaveLength(5);
    expect(me.questions?.[0]).toMatchObject({ id: "drink", text: "Tea or coffee?" });
    expect(me.user.answers).toEqual({});
  });

  it("sets one answer at a time and keeps the user's others", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);

    await api.updateMe({ answers: { drink: "tea" } });
    const answer = await api.updateMe({ answers: { hours: "night_owl" } });

    expect(answer.user.answers).toEqual({ drink: "tea", hours: "night_owl" });
  });

  it("changes an answer the user already gave", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);
    await api.updateMe({ answers: { drink: "tea" } });

    const answer = await api.updateMe({ answers: { drink: "coffee" } });

    expect(answer.user.answers).toEqual({ drink: "coffee" });
  });

  it("refuses a PATCH with neither the name nor the answers", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);

    const error = await api.updateMe({}).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("validation_failed");
    expect((error as ApiError).issues).toEqual([
      {
        path: [],
        message: "A request needs at least one of display_name, answers, bio and contact_line",
      },
    ]);
  });

  it("adds a point for a connection, whatever its match", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);
    const before = await api.me();

    connect(api);

    await expect(api.me()).resolves.toMatchObject({ points: before.points + 1 });
  });

  it("refuses an unknown question under its ID and changes nothing", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);

    const error = await api
      .updateMe({ answers: { drink: "tea", snack: "chips" } })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("validation_failed");
    expect((error as ApiError).issues).toEqual([
      { path: ["answers", "snack"], message: "No question has this ID" },
    ]);
    await expect(api.me()).resolves.toMatchObject({ user: { answers: {} } });
  });

  it("refuses a choice that is not the question's, under its ID", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);

    const error = await api
      .updateMe({ answers: { drink: "milo" } })
      .catch((reason: unknown) => reason);

    expect((error as ApiError).issues).toEqual([
      {
        path: ["answers", "drink"],
        message: "The question has no choice with this ID",
      },
    ]);
    await expect(api.me()).resolves.toMatchObject({ user: { answers: {} } });
  });

  it("keeps existing answers fixed after connecting, but lets missing answers be filled", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);
    await api.updateMe({ answers: { drink: "tea" } });
    connect(api);

    await expectApiError(api.updateMe({ answers: {} }), "answers_fixed", 409);
    await expectApiError(api.updateMe({ answers: { drink: "coffee" } }), "answers_fixed", 409);
    await api.updateMe({ answers: { hours: "night_owl" } });
    await expect(api.me()).resolves.toMatchObject({
      user: { answers: { drink: "tea", hours: "night_owl" } },
    });
  });

  it("still changes the name after a connection when the request has no answers", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    connect(api, SEEDED_PARTICIPANT_ID);

    await expect(api.updateMe({ display_name: "Alex" })).resolves.toMatchObject({
      user: { display_name: "Alex", has_name: true },
    });
  });

  it("gives no questions without an answers game, and accepts only an empty map", async () => {
    const api = client();
    await api.devLogin(SEEDED_GUEST_ID);
    api.mock.data.questions = null;

    await expect(api.me()).resolves.toMatchObject({ questions: null });
    await expectApiError(api.updateMe({ answers: { drink: "tea" } }), "validation_failed", 400);
    await expect(api.updateMe({ answers: {} })).resolves.toMatchObject({
      user: { answers: {} },
    });
  });

  it("keeps answers and questions off the map and the station board", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await api.updateMe({ answers: { drink: "tea" } });

    const board = JSON.stringify(await api.listStationBoard());
    const map = JSON.stringify(await api.map());

    for (const body of [board, map]) {
      expect(body).not.toContain('"answers"');
      expect(body).not.toContain('"questions"');
    }
  });
});

describe("station board", () => {
  it("covers passport, disabled, offline, buffered, and reader states", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.listStationBoard();

    expect(board.stations.some((station) => station.passport === null)).toBe(true);
    expect(board.stations.some((station) => station.disabled_at !== null)).toBe(true);
    expect(board.stations.some((station) => station.online === false)).toBe(true);
    expect(board.stations.some((station) => (station.buffered_taps ?? 0) > 0)).toBe(true);
    expect(board.stations.some((station) => station.reader_ok === false)).toBe(true);
    expect(board.stations.some((station) => station.last_tap_at !== null)).toBe(true);
    // The three heartbeat fields are null until a heartbeat reports them (agreement 9.2).
    expect(board.stations.some((station) => station.reader_ok === null)).toBe(true);
  });

  it("gives every station a label, a created_at, and no linked or status_known", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.listStationBoard();

    expect(board).not.toHaveProperty("status_known");
    for (const station of board.stations) {
      expect(station).not.toHaveProperty("linked");
      expect(station.label).not.toBe("");
      expect(station.created_at).not.toBe("");
    }
  });

  // Agreement 9.2 and 0.7: the board names the game each station runs, whether that game is
  // fixed, and the booth the map draws it at (9.10, 9.11, 9.12).
  it("gives every station its game, game_fixed and booth", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.listStationBoard();

    // The mock has no game picker, so a station with passport settings runs the passport.
    const inPassport = board.stations.filter((station) => station.passport !== null);
    expect(inPassport.length).toBeGreaterThan(0);
    for (const station of inPassport) expect(station.game).toBe("passport");
    expect(board.stations.some((station) => station.game === null)).toBe(true);

    // A game is fixed once it has counted or held back a tap there (9.11), and the fixtures
    // hold both a station with counted taps and one with only a no_game tap.
    expect(board.stations.some((station) => station.game_fixed)).toBe(true);
    expect(board.stations.some((station) => !station.game_fixed)).toBe(true);

    // The fixtures name booths from the example plan plus one it doesn't name, and leave one
    // station without a booth.
    expect(board.stations.some((station) => station.booth === "B1")).toBe(true);
    expect(board.stations.some((station) => station.booth === null)).toBe(true);
  });

  it("reads a station that has never handed off as offline, with no last_seen_at", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await api.createStation({ label: "Reader 9" });

    const board = await api.listStationBoard();
    const fresh = board.stations.find((station) => station.label === "Reader 9")!;
    // Agreement 9.2: last_seen_at is set by every hand-off, and 9.7 registers the station
    // at once, so a brand new one has none and is offline until it sends something.
    expect(fresh.last_seen_at).toBeNull();
    expect(fresh.online).toBe(false);
    expect(fresh.passport).toBeNull();
    expect(fresh.disabled_at).toBeNull();
  });
});

describe("setting a station's booth (agreement 9.12)", () => {
  async function setup() {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const stations = (await api.listStationBoard()).stations;
    return { api, stations };
  }

  it("saves a trimmed booth, and 9.2 reads it back", async () => {
    const { api, stations } = await setup();
    const target = stations[0]!;

    const answer = await api.setStationBooth(target.id, { booth: "  C4  " });

    expect(answer.station.booth).toBe("C4");
    const after = (await api.listStationBoard()).stations.find((one) => one.id === target.id);
    expect(after?.booth).toBe("C4");
  });

  it("clears the booth when it is blank", async () => {
    const { api, stations } = await setup();
    const target = stations[0]!;

    const answer = await api.setStationBooth(target.id, { booth: "   " });

    expect(answer.station.booth).toBeNull();
    const after = (await api.listStationBoard()).stations.find((one) => one.id === target.id);
    expect(after?.booth).toBeNull();
  });

  it("refuses a booth over 80 code points, under `booth`, and saves nothing", async () => {
    const { api, stations } = await setup();
    const target = stations[0]!;
    const before = target.booth;

    const error = await api
      .setStationBooth(target.id, { booth: "x".repeat(81) })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("validation_failed");
    expect((error as ApiError).issues).toEqual([
      { path: ["booth"], message: "booth must be 0 to 80 characters" },
    ]);

    const after = (await api.listStationBoard()).stations.find((one) => one.id === target.id);
    expect(after?.booth).toBe(before);
  });

  it("counts code points, so 41 emoji fit although they are 82 UTF-16 units", async () => {
    const { api, stations } = await setup();
    const target = stations[0]!;
    const emoji = "🙂".repeat(41);

    const answer = await api.setStationBooth(target.id, { booth: emoji });

    expect(answer.station.booth).toBe(emoji);
  });

  it("sets it on a disabled station and on one whose game is fixed", async () => {
    const { api, stations } = await setup();
    const disabled = stations.find((one) => one.disabled_at !== null)!;
    const tapped = stations.find((one) => one.game_fixed && one.disabled_at === null)!;

    await api.setStationBooth(disabled.id, { booth: "C5" });
    await api.setStationBooth(tapped.id, { booth: "A1" });

    const after = (await api.listStationBoard()).stations;
    expect(after.find((one) => one.id === disabled.id)?.booth).toBe("C5");
    expect(after.find((one) => one.id === tapped.id)?.booth).toBe("A1");
  });

  it("answers not_found for a station it does not have, and forbids a participant", async () => {
    const { api, stations } = await setup();

    await expectApiError(api.setStationBooth("no-such-station", { booth: "A1" }), "not_found", 404);

    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await expectApiError(api.setStationBooth(stations[0]!.id, { booth: "A1" }), "forbidden", 403);
  });

  it("checks the body before the station, as the service's validator does", async () => {
    // The service runs `jsonBody(boothSchema)` before the handler that answers not_found, so
    // an over-long booth on an unknown ID is 400 and not 404.
    const { api } = await setup();

    await expectApiError(
      api.setStationBooth("no-such-station", { booth: "x".repeat(81) }),
      "validation_failed",
      400,
    );
  });
});

describe("scan log", () => {
  it("pages newest first with a before_id cursor and no overlap", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const first = await api.listTaps({ limit: 10 });
    expect(first.taps).toHaveLength(10);
    expect(first.taps[0]!.id).toBeGreaterThan(first.taps[9]!.id);
    expect(first.next_before_id).toBe(first.taps[9]!.id);
    const second = await api.listTaps({ limit: 10, before_id: first.next_before_id! });
    expect(second.taps.every((t) => t.id < first.next_before_id!)).toBe(true);
  });

  it("filters stored no_game taps and keeps their user", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const noGame = await api.listTaps({ status: "no_game" });
    expect(noGame.taps.length).toBeGreaterThan(0);
    expect(noGame.taps.every((t) => t.status === "no_game" && t.user !== null)).toBe(true);
  });
});

describe("QR fallback", () => {
  it("accepts once, then cooldown for the same participant at the same station", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.find((s) => s.passport?.name === "3D Printing Booth")!;
    const first = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    expect(first.result.status).toBe("accepted");
    const second = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    expect(second.result.status).toBe("cooldown");
  });

  it("accepts a known user_id fallback", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.find((s) => s.passport?.name === "3D Printing Booth")!;
    const result = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    const stored = api.mock.data.taps.find((tap) => tap.id === result.result.id)!;
    expect(result.result.status).toBe("accepted");
    expect(stored.user_id).toBe("u_2e8b");
  });

  it("accepts a user ID that has never logged in", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.find((s) => s.passport?.name === "3D Printing Booth")!;
    const result = await api.createFallbackTap({ station_id: station.id, user_id: "new-user-123" });
    expect(result.result.status).toBe("accepted");
    expect(api.mock.data.taps.find((tap) => tap.id === result.result.id)?.user_id).toBe(
      "new-user-123",
    );
  });

  it("rejects a blank user ID", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.find((s) => s.passport?.name === "3D Printing Booth")!;
    await expectApiError(
      api.createFallbackTap({ station_id: station.id, user_id: " " }),
      "validation_failed",
      400,
    );
  });

  it("returns 404 for a station that does not exist", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await expectApiError(
      api.createFallbackTap({ station_id: "nope", user_id: "u_2e8b" }),
      "not_found",
      404,
    );
  });
});

// Agreement 9.5: the stats list the stamp slots (section 4) only, in the order their passport
// settings were added, each named by its passport name.
describe("stats", () => {
  it("lists the stamp slots only, oldest settings first, by their passport names", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const stats = await api.stats();

    // Stations 3 and 6 have no passport settings, so they aren't listed. Info Desk is
    // disabled and keeps its slot (9.9).
    expect(stats.stations.map((station) => station.name)).toEqual([
      "Cloud Sponsor",
      "3D Printing Booth",
      "Mentor Lounge",
      "Careers Corner",
      "Info Desk",
    ]);
  });

  it("lists a new stamp slot last, with zeros, and its label never stands in", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const { station } = await api.createStation({ label: "Robotics Corner" });
    expect((await api.stats()).stations.map((s) => s.station_id)).not.toContain(station.id);

    await api.setStationPassport(station.id, { name: "Robot Arena" });
    const last = (await api.stats()).stations.at(-1);

    expect(last).toEqual({
      station_id: station.id,
      name: "Robot Arena",
      accepted_taps: 0,
      unique_participants: 0,
    });
  });

  it("counts the taps at a station outside the passport in the totals", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const outside = api.mock.data.stations.find((station) => !station.passport)!.id;
    const before = await api.stats();
    api.mock.data.taps.push({
      ...api.mock.data.taps[0]!,
      id: 999_999,
      client_tap_id: "tap-fro-81",
      station_id: outside,
      status: "accepted",
    });

    const after = await api.stats();
    expect(after.total_taps).toBe(before.total_taps + 1);
    expect(after.accepted_taps).toBe(before.accepted_taps + 1);
    expect(after.stations).toEqual(before.stations);
  });
});

describe("station keys and export", () => {
  it("returns the key once, prefixed, and never in the board", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const created = await api.createStation({ label: "Robotics Corner" });
    expect(created.api_key.startsWith("gk_sta_")).toBe(true);
    // Agreement 9.7: the station joins the board at once with no passport settings, so its
    // taps get no_game until 9.1 adds them.
    expect(created.station.passport).toBeNull();
    const board = await api.listStationBoard();
    const listed = board.stations.find((s) => s.id === created.station.id);
    expect(listed).toBeDefined();
    expect(listed?.label).toBe("Robotics Corner");
    expect(JSON.stringify(board)).not.toContain(created.api_key);
  });

  // 9.8 replaces the key and nothing else. These take the board station either side of the
  // call and ask for equality, which is the whole promise in one assertion: the same id, the
  // same passport settings with the same added_at, the same disabled_at, the same health and
  // the same last tap.
  it("replaces the key and leaves the station exactly as it was (agreement 9.8)", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    // The first fixture carries passport settings, so it has a stamp to keep.
    const before = (await api.listStationBoard()).stations[0]!;

    const replaced = await api.replaceStationKey(before.id);

    const after = (await api.listStationBoard()).stations.find((s) => s.id === before.id);
    expect(replaced.api_key).toMatch(/^gk_sta_/);
    expect(after).toEqual(before);
    expect(replaced.station).toEqual(before);
  });

  it("mints a different key each time, and never puts it in the board", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const id = (await api.listStationBoard()).stations[0]!.id;

    const first = await api.replaceStationKey(id);
    const second = await api.replaceStationKey(id);

    expect(second.api_key).not.toBe(first.api_key);
    // 9.7 promises the key is never in the board, and 9.8 repeats it: only the response
    // that issued a key carries it.
    const board = JSON.stringify(await api.listStationBoard());
    expect(board).not.toContain(first.api_key);
    expect(board).not.toContain(second.api_key);
  });

  it("keeps the station's stamp", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const id = (await api.listStationBoard()).stations[0]!.id;
    const before = (await api.me()).stamps.find((s) => s.station_id === id);

    await api.replaceStationKey(id);

    expect((await api.me()).stamps.find((s) => s.station_id === id)).toEqual(before);
  });

  it("answers not_found for a station this Event Service did not register", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    await expectApiError(api.replaceStationKey("no-such-station"), "not_found", 404);
  });

  it("rejects a blank or over-long label (agreement 9.7)", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await expectApiError(api.createStation({ label: "  " }), "validation_failed", 400);
    await expectApiError(api.createStation({ label: "x".repeat(81) }), "validation_failed", 400);
  });

  it("exports the agreed ten CSV columns, in order", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const [header, ...rows] = await exportLines(api);

    expect(header).toBe(EXPORT_CSV_COLUMNS.join(","));
    expect(EXPORT_CSV_COLUMNS).toHaveLength(10);
    expect(rows.length).toBeGreaterThan(0);
    // Guards the gap between the header constant and the hand-built row.
    for (const row of rows) expect(row.split(",")).toHaveLength(EXPORT_CSV_COLUMNS.length);
    // The order itself, written out. Comparing the header against the constant cannot catch a
    // reordered constant, because the mock builds the header from that same constant, so the
    // two would stay wrong together. Agreement 9.6 fixes the order, so the literal list is
    // asserted here rather than derived from the constant.
    expect(EXPORT_CSV_COLUMNS).toEqual([
      "tap_id",
      "client_tap_id",
      "station_id",
      "station_name",
      "user_id",
      "display_name",
      "status",
      "source",
      "tapped_at",
      "received_at",
    ]);
  });

  it("ends every line in CRLF, the last one too", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const text = await (await api.exportCsv()).text();

    expect(text.endsWith("\r\n")).toBe(true);
    // No fixture value holds a line break, so every CR and LF is a line end.
    expect(text.match(/\r\n/g)).toHaveLength(api.mock.data.taps.length + 1);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it.each([
    ["a carriage return", "Wei\rLin", '"Wei\rLin"'],
    ["a line feed", "Wei\nLin", '"Wei\nLin"'],
    ["a comma", "Chong, Wei Lin", '"Chong, Wei Lin"'],
    ["a double quote", 'Wei "WL" Lin', '"Wei ""WL"" Lin"'],
  ])("quotes a value holding %s", async (_, name, cell) => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.users.find((user) => user.id === "u_7f3a")!.display_name = name;
    const text = await (await api.exportCsv()).text();

    expect(text).toContain(`,u_7f3a,${cell},`);
  });

  it("leaves station_name and display_name empty when the tap has neither", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const lines = await exportLines(api);
    const header = lines[0]!.split(",");
    const stationNameAt = header.indexOf("station_name");
    const displayNameAt = header.indexOf("display_name");

    const guestRow = lines
      .slice(1)
      .find((line) =>
        line.startsWith(`${api.mock.data.taps.find((t) => t.user_id === "u_9d4f")!.id},`),
      );
    expect(guestRow?.split(",")[displayNameAt]).toBe("");

    const noGameRow = lines
      .slice(1)
      .find((line) => line.split(",")[header.indexOf("status")] === "no_game");
    expect(noGameRow?.split(",")[stationNameAt]).toBe("");
  });

  it("can be told to fail once", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.failNext("internal_error");
    await expectApiError(api.stats(), "internal_error", 500);
    await expect(api.stats()).resolves.toBeDefined();
  });
});

// Agreement 9.9. Disabling is the board's outward-off action, so these tests hold the
// same promise the 9.8 block does: the row comes back as exactly the before row, with
// disabled_at the only move. The fixtures already carry both directions: Station 1 is
// enabled, and the Info Desk row was disabled five minutes before the seed ran.
describe("disable and enable stations", () => {
  it("disables an enabled station and answers it as the board lists it", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const before = (await api.listStationBoard()).stations.find((s) => s.label === "Station 1")!;
    expect(before.disabled_at).toBeNull();

    const disabled = await api.disableStation(before.id);

    const after = (await api.listStationBoard()).stations.find((s) => s.id === before.id)!;
    expect(after.disabled_at).toBeTypeOf("string");
    expect({ ...after, disabled_at: null }).toEqual(before);
    expect(disabled.station).toEqual(after);
  });

  it("enables the disabled fixture and clears only disabled_at", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const before = (await api.listStationBoard()).stations.find(
      (s) => s.passport?.name === "Info Desk",
    )!;
    expect(before.disabled_at).not.toBeNull();

    const enabled = await api.enableStation(before.id);

    expect(enabled.station).toEqual({ ...before, disabled_at: null });
    const after = (await api.listStationBoard()).stations.find((s) => s.id === before.id)!;
    expect(after).toEqual({ ...before, disabled_at: null });
  });

  // 9.9: "Doing either twice changes nothing." A re-disable keeps the original
  // disabled_at rather than moving it, and a re-enable stays empty.
  it("changes nothing when either action runs a second time (agreement 9.9)", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.listStationBoard();
    const enabled = board.stations.find((s) => s.label === "Station 1")!;
    const disabled = board.stations.find((s) => s.passport?.name === "Info Desk")!;

    const reenabled = await api.enableStation(enabled.id);
    const redisabled = await api.disableStation(disabled.id);

    expect(reenabled.station).toEqual(enabled);
    expect(redisabled.station).toEqual(disabled);
    const fresh = await api.listStationBoard();
    expect(fresh.stations.find((s) => s.id === enabled.id)).toEqual(enabled);
    expect(fresh.stations.find((s) => s.id === disabled.id)).toEqual(disabled);
  });

  it("keeps the station's stamp, the way 9.2 keeps it for a disabled station", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const id = (await api.listStationBoard()).stations[0]!.id;
    const before = (await api.me()).stamps.find((s) => s.station_id === id);

    await api.disableStation(id);

    expect((await api.me()).stamps.find((s) => s.station_id === id)).toEqual(before);
  });

  it("answers not_found for a station this Event Service did not register", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    await expectApiError(api.disableStation("no-such-station"), "not_found", 404);
    await expectApiError(api.enableStation("no-such-station"), "not_found", 404);
  });
});

describe("the mock's groups (draft for agreement 0.14)", () => {
  it("joins a participant once, and refuses an organizer", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    expect((await api.myGroup()).status).toBe("not_joined");

    expect((await api.joinGroups()).status).toBe("waiting");
    const joined = api.mock.data.groupMembers.length;
    expect((await api.joinGroups()).status).toBe("waiting");
    expect(api.mock.data.groupMembers).toHaveLength(joined);

    await api.devLogin(SEEDED_ORGANIZER_ID);
    expect((await api.myGroup()).status).toBe("not_joined");
    await expectApiError(api.joinGroups(), "forbidden", 403);
  });

  it("refuses a participant on the organizer's calls", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expectApiError(api.groupBoard(), "forbidden", 403);
    await expectApiError(api.createGroup({ name: "Mine" }), "forbidden", 403);
    await expectApiError(api.allocateGroups(), "forbidden", 403);
    await expectApiError(api.splitGroups({ people_per_group: 2 }), "forbidden", 403);
  });

  it("starts connecting across token kinds, and only an organizer changes it (BAC-140)", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await expectApiError(api.setConnectionRule({ connect_across: "groups" }), "forbidden", 403);

    await api.devLogin(SEEDED_ORGANIZER_ID);
    expect((await api.groupBoard()).connect_across).toBe("token_kinds");
    expect(await api.setConnectionRule({ connect_across: "groups" })).toEqual({
      connect_across: "groups",
    });
    expect((await api.groupBoard()).connect_across).toBe("groups");
  });

  it("refuses a participant on the organizer's edits and moves", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expectApiError(api.updateGroup("g_foyer", { name: "Mine" }), "forbidden", 403);
    await expectApiError(api.deleteGroup("g_foyer"), "forbidden", 403);
    await expectApiError(api.placeGroupMember("u_7f3a", "g_foyer"), "forbidden", 403);
    await expectApiError(api.removeGroupMember("u_7f3a"), "forbidden", 403);
  });

  it("keeps a group's tags and location, trimmed, and refuses ones past the limits", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    const group = await api.createGroup({
      name: "Mixer A",
      tags: [" Mixer ", "Year 1"],
      location: " Room 3-01 ",
    });
    expect([group.tags, group.location]).toEqual([["Mixer", "Year 1"], "Room 3-01"]);
    expect((await api.createGroup({ name: "Mixer B", location: "  " })).location).toBeNull();

    for (const input of [
      { tags: ["a", "b", "c", "d", "e", "f"] },
      { tags: ["fine", "  "] },
      { tags: ["x".repeat(81)] },
      { location: "x".repeat(81) },
    ]) {
      await expectApiError(
        api.createGroup({ name: "Mixer C", ...input }),
        "validation_failed",
        400,
      );
    }
  });

  it("edits every field of a group, keeps its own name, and moves nobody", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const before = await api.allocateGroups();
    const foyer = before.groups[0]!;

    const edited = await api.updateGroup(foyer.id, {
      name: "FOYER MIXER",
      tags: ["Year 1"],
      location: "Foyer",
      capacity: 1,
    });

    expect(edited).toEqual({
      ...foyer,
      name: "FOYER MIXER",
      tags: ["Year 1"],
      location: "Foyer",
      capacity: 1,
    });
    const bare = await api.updateGroup(foyer.id, { name: "Foyer mixer" });
    expect([bare.tags, bare.location, bare.capacity]).toEqual([[], null, null]);
    await expectApiError(api.updateGroup(foyer.id, { name: "atrium MIXER" }), "name_taken", 409);
    await expectApiError(api.updateGroup("no-such-group", { name: "X" }), "not_found", 404);
    // As the Event Service answers: a missing group before a taken name.
    await expectApiError(
      api.updateGroup("no-such-group", { name: "Atrium mixer" }),
      "not_found",
      404,
    );
  });

  it("sends a deleted group's members back to waiting", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const before = await api.allocateGroups();
    const [foyer, atrium] = before.groups;

    await api.deleteGroup(foyer!.id);

    const after = await api.groupBoard();
    expect(after.groups).toEqual([atrium]);
    expect(after.waiting.map(({ user_id }) => user_id).sort()).toEqual(
      foyer!.members.map(({ user_id }) => user_id).sort(),
    );
    await expectApiError(api.deleteGroup(foyer!.id), "not_found", 404);
  });

  it("puts someone in a group past its capacity, or back to waiting, as the organizer's", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const full = await api.createGroup({ name: "Small room", capacity: 1 });
    const [first, second] = (await api.groupBoard()).waiting;

    await api.placeGroupMember(first!.user_id, full.id);
    const board = await api.placeGroupMember(second!.user_id, full.id);

    const room = board.groups.find(({ id }) => id === full.id)!;
    expect(room.members.map(({ user_id, how }) => [user_id, how])).toEqual([
      [first!.user_id, "organizer"],
      [second!.user_id, "organizer"],
    ]);
    const back = await api.placeGroupMember(first!.user_id, null);
    expect(back.waiting.map(({ user_id }) => user_id)).toContain(first!.user_id);
    expect(back.groups.find(({ id }) => id === full.id)!.members).toHaveLength(1);
  });

  it("joins someone an organizer places who hasn't joined, and refuses an organizer account", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const group = api.mock.data.groups[0]!;

    const board = await api.placeGroupMember(SEEDED_PARTICIPANT_ID, group.id);

    expect(board.joined_count).toBe(6);
    await expectApiError(api.placeGroupMember(SEEDED_ORGANIZER_ID, group.id), "forbidden", 403);
    await expectApiError(api.placeGroupMember("no-such-user", group.id), "not_found", 404);
    await expectApiError(
      api.placeGroupMember(SEEDED_PARTICIPANT_ID, "no-such-group"),
      "not_found",
      404,
    );
  });

  it("removes someone, who can then join again", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await api.joinGroups();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    await api.removeGroupMember(SEEDED_PARTICIPANT_ID);

    expect((await api.groupBoard()).joined_count).toBe(5);
    await expectApiError(api.removeGroupMember(SEEDED_PARTICIPANT_ID), "not_found", 404);
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    expect((await api.myGroup()).status).toBe("not_joined");
    expect((await api.joinGroups()).status).toBe("waiting");
  });

  it("refuses a name another group has, and a blank one", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await api.createGroup({ name: "Mixer A" });

    await expectApiError(api.createGroup({ name: " Mixer A " }), "name_taken", 409);
    await expectApiError(api.createGroup({ name: "mixer a" }), "name_taken", 409);
    await expectApiError(api.createGroup({ name: "   " }), "validation_failed", 400);
  });

  it("places everyone waiting, sizes at most one apart, and starts allocation", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const { waiting } = await api.groupBoard();
    expect(waiting).toHaveLength(5);

    const board = await api.allocateGroups();

    expect(board.waiting).toEqual([]);
    expect(board.allocation_started_at).not.toBeNull();
    expect(board.groups.map((group) => group.members.length)).toEqual([3, 2]);
  });

  it("splits into numbered groups worked out from who has joined, with the form's capacity and locations, and places everyone", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.groups = [];

    // 5 have joined, and the third location has no group.
    const board = await api.splitGroups({
      people_per_group: 2,
      locations: [" Hall ", "", "Lobby"],
    });

    expect(board.groups.map(({ name, capacity, location }) => [name, capacity, location])).toEqual([
      ["Group 1", 2, "Hall"],
      ["Group 2", 2, null],
    ]);
    expect(board.groups.map((group) => group.members.length)).toEqual([3, 2]);
    expect(board.waiting).toEqual([]);
    expect(board.allocation_started_at).not.toBeNull();
  });

  it("splits by number of groups with no capacity, refusing fewer than 2 joined for each", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.groups = [];

    // 5 have joined.
    const tooFew = await api
      .splitGroups({ group_count: 3 })
      .catch((error: unknown) => error as ApiError);
    expect(tooFew).toMatchObject({ code: "too_few_participants", needed: 1 });
    expect(api.mock.data.groups).toEqual([]);

    const board = await api.splitGroups({ group_count: 2, locations: ["Hall"] });

    expect(board.groups.map(({ name, capacity, location }) => [name, capacity, location])).toEqual([
      ["Group 1", null, "Hall"],
      ["Group 2", null, null],
    ]);
    expect(board.groups.map((group) => group.members.length)).toEqual([3, 2]);
  });

  it("refuses a split with both numbers or neither, as the Event Service does", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.groups = [];

    for (const input of [{}, { people_per_group: 2, group_count: 2 }]) {
      await expectApiError(
        api.splitGroups(input as unknown as SplitGroupsRequest),
        "validation_failed",
        400,
      );
    }
    await expectApiError(api.splitGroups({ group_count: 0 }), "validation_failed", 400);
    expect(api.mock.data.groups).toEqual([]);
  });

  it("replaces groups with nobody in them, and refuses with anyone placed, changing nothing", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    const replaced = await api.splitGroups({ group_count: 2 });
    expect(replaced.groups.map(({ name }) => name)).toEqual(["Group 1", "Group 2"]);

    await expectApiError(api.splitGroups({ people_per_group: 2 }), "groups_exist", 409);
    expect(api.mock.data.groups.map(({ capacity }) => capacity)).toEqual([null, null]);
  });

  it("refuses a split with too few joined, or below 2 per group, and makes nothing", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.groups = [];
    await expectApiError(api.splitGroups({ people_per_group: 1 }), "validation_failed", 400);
    await expectApiError(api.splitGroups({ people_per_group: 2.5 }), "validation_failed", 400);
    api.mock.data.groupMembers = api.mock.data.groupMembers.slice(0, 1);
    const tooFew = await api
      .splitGroups({ people_per_group: 2 })
      .catch((error: unknown) => error as ApiError);
    expect(tooFew).toMatchObject({ code: "too_few_participants", needed: 1 });
    expect(api.mock.data.groups).toEqual([]);
    expect(api.mock.data.groupAllocationStartedAt).toBeNull();
  });

  it("places a latecomer as they join, in the smallest group, or waits with no groups", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const allocated = await api.allocateGroups();
    expect(allocated.groups.map((group) => group.members.length)).toEqual([3, 2]);

    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const mine = await api.joinGroups();

    expect(mine.status).toBe("placed");
    expect(mine.group?.id).toBe(allocated.groups[1]?.id);
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.groupBoard();
    const latecomer = board.groups[1]?.members.find(
      (member) => member.user_id === SEEDED_PARTICIPANT_ID,
    );
    expect(latecomer?.how).toBe("latecomer");
    expect(latecomer?.placed_at).toBe(latecomer?.joined_at);

    // With no groups left, the next one waits.
    api.mock.data.groups = [];
    api.mock.data.groupMembers = api.mock.data.groupMembers.filter(
      (member) => member.user_id !== SEEDED_PARTICIPANT_ID,
    );
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    expect(await api.joinGroups()).toEqual({
      status: "waiting",
      allocation_started: true,
      group: null,
    });
  });

  it("keeps a group's capacity, and refuses one that isn't a whole number above 0", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);

    expect((await api.createGroup({ name: "Small room", capacity: 2 })).capacity).toBe(2);
    expect((await api.createGroup({ name: "Hall", capacity: null })).capacity).toBeNull();
    await expectApiError(api.createGroup({ name: "Stage", capacity: 0 }), "validation_failed", 400);
    await expectApiError(
      api.createGroup({ name: "Stage", capacity: 1.5 }),
      "validation_failed",
      400,
    );
  });

  it("answers no_groups to Allocate with no groups, and starts nothing", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.groups = [];

    await expectApiError(api.allocateGroups(), "no_groups", 409);
    expect((await api.groupBoard()).allocation_started_at).toBeNull();
  });

  it("answers too_few_participants with how many more it needs", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await api.createGroup({ name: "Mixer C" });
    await api.createGroup({ name: "Mixer D" });

    // 5 have joined, and 4 groups need 8.
    const error = await api.allocateGroups().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("too_few_participants");
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).needed).toBe(3);
    expect((await api.groupBoard()).waiting).toHaveLength(5);
  });

  it("fills groups with room first, then overflows into the smallest", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.groups = [];
    await api.createGroup({ name: "Small", capacity: 1 });
    await api.createGroup({ name: "Large", capacity: 3 });

    // 5 waiting: Small fills at 1 and Large at 3, then the last overflows into Small.
    const board = await api.allocateGroups();

    expect(board.groups.map((group) => group.members.length)).toEqual([2, 3]);
    expect(board.waiting).toEqual([]);
  });

  it("leaves a placed participant's answer to names, for their own group only", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await api.joinGroups();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.allocateGroups();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    const { status, group } = await api.myGroup();

    const onBoard = board.groups.find(({ id }) => id === group?.id);
    expect(status).toBe("placed");
    expect(group?.members).toEqual(onBoard?.members.map(({ display_name }) => ({ display_name })));
  });
});

describe("mock groups export", () => {
  /** The groups CSV's lines, split on the CRLF that ends each one. */
  async function groupExportLines(api: ReturnType<typeof client>) {
    const text = await (await api.exportGroupsCsv()).text();
    expect(text.endsWith("\r\n")).toBe(true);
    return text.slice(0, -2).split("\r\n");
  }

  it("refuses a participant", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expectApiError(api.exportGroupsCsv(), "forbidden", 403);
  });

  it("has the service's columns, and a row with an empty group for everyone waiting", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const { joined_count } = await api.groupBoard();

    const [header, ...rows] = await groupExportLines(api);

    expect(header).toBe(GROUPS_EXPORT_CSV_COLUMNS.join(","));
    expect(rows).toHaveLength(joined_count);
    for (const row of rows) {
      const [, , group, , placedAt, how] = row.split(",");
      expect([group, placedAt, how]).toEqual(["", "", ""]);
    }
  });

  it("gives each placed person their group, placed time and how, in the order they joined", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const board = await api.allocateGroups();

    const rows = (await groupExportLines(api)).slice(1).map((row) => row.split(","));

    const joined = board.groups.flatMap((group) => group.members);
    expect(rows.map((row) => row[0])).toEqual(
      joined.toSorted((a, b) => a.joined_at.localeCompare(b.joined_at)).map((m) => m.user_id),
    );
    for (const [userId, , group, , placedAt, how] of rows) {
      const home = board.groups.find((g) => g.members.some((m) => m.user_id === userId))!;
      expect(group).toBe(home.name);
      expect(placedAt).toBe(board.allocation_started_at);
      expect(how).toBe("allocated");
    }
  });

  it("quotes a name with a comma", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.users.find((user) => user.id === "u_7f3a")!.display_name = "Chong, Wei Lin";

    expect((await groupExportLines(api)).join("\n")).toContain('u_7f3a,"Chong, Wei Lin",');
  });
});

describe("connection requests (BAC-149, a draft for the agreement's next version)", () => {
  it("gives the seeded participant one, so it shows in pnpm dev", async () => {
    const api = client();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const { connection_requests: requests } = await api.me();
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty("accept_answer");
  });

  it("makes a connection on accepting, and takes the request away", async () => {
    const api = client();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const before = await api.me();
    const [request] = before.connection_requests;

    await expect(api.acceptConnectionRequest(request!.id)).resolves.toEqual({
      status: "connected",
    });

    const after = await api.me();
    expect(after.connection_requests).toEqual([]);
    expect(after.connections).toHaveLength(before.connections.length + 1);
  });

  it("takes the request away on declining, with no connection", async () => {
    const api = client();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const before = await api.me();

    await api.declineConnectionRequest(before.connection_requests[0]!.id);

    const after = await api.me();
    expect(after.connection_requests).toEqual([]);
    expect(after.connections).toEqual(before.connections);
  });

  it("starts a reaction test on accepting the seeded request, played once (BAC-156)", async () => {
    const api = client();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const [request] = (await api.me()).connection_requests;
    await api.acceptConnectionRequest(request!.id);
    const [connection] = (await api.me()).connections;
    expect(connection?.dice).toBeNull();
    expect(connection?.reaction).toMatchObject({
      your_play: "not_played",
      their_play: "played",
      their_ms: null,
      result: null,
    });

    await expectApiError(api.playReaction(connection!.id!, { ms: 0 }), "validation_failed", 400);
    await expect(api.playReaction(connection!.id!, { ms: 240 })).resolves.toEqual({
      reaction: expect.objectContaining({ your_ms: 240, their_ms: 287, result: "win" }),
    });
    await expectApiError(api.playReaction(connection!.id!, { early: true }), "already_played", 409);
    expect((await api.me()).connections[0]?.reaction?.result).toBe("win");
    await expectApiError(api.playReaction("gone", { ms: 240 }), "not_found", 404);
  });

  it("answers not_found for a request that no longer waits", async () => {
    const api = client();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    await expectApiError(api.acceptConnectionRequest("gone"), "not_found", 404);
    await expectApiError(api.declineConnectionRequest("gone"), "not_found", 404);
  });
});
