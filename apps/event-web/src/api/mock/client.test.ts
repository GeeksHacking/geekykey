import { describe, expect, it, onTestFinished } from "vitest";

import { ApiError, AUTH_ERROR_EVENT } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { EXPORT_CSV_COLUMNS } from "@/api/types";

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

describe("the name the event shows (agreement 8.7)", () => {
  it("saves the trimmed name, answers the user, and counts it as their own", async () => {
    const api = client();
    await api.loginLink("guest");

    const answer = await api.setDisplayName({ display_name: "  Mei Ling  " });

    expect(answer).toEqual({
      user: { id: SEEDED_GUEST_ID, display_name: "Mei Ling", role: "participant", has_name: true },
    });
    await expect(api.me()).resolves.toMatchObject({ user: answer.user });
  });

  it("counts a name the user sets as their own, even Guest", async () => {
    const api = client();
    await api.loginLink("guest");

    await api.setDisplayName({ display_name: "Guest" });

    await expect(api.me()).resolves.toMatchObject({ user: { has_name: true } });
  });

  it("counts code points, so 30 emoji fit and 31 letters do not", async () => {
    // Each of these emoji is two UTF-16 units, so a .length check would refuse them.
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expect(api.setDisplayName({ display_name: "🦊".repeat(30) })).resolves.toBeDefined();

    const refused = await api
      .setDisplayName({ display_name: "a".repeat(31) })
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).code).toBe("validation_failed");
    expect((refused as ApiError).issues?.[0]?.path).toEqual(["display_name"]);
  });

  it("refuses a name that is blank once trimmed and leaves the name as it was", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);

    await expectApiError(api.setDisplayName({ display_name: "   " }), "validation_failed", 400);

    await expect(api.me()).resolves.toMatchObject({
      user: { display_name: "Alex Tan", has_name: true },
    });
  });

  it("answers 401 when nobody is signed in", async () => {
    await expectApiError(client().setDisplayName({ display_name: "Alex" }), "unauthenticated", 401);
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
    const outside = "e0f3a9b2-6c4d-4a1e-8f5b-7d2c9e1a0b63"; // Station 3, no passport settings
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
