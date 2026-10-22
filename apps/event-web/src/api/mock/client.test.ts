import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { EXPORT_CSV_COLUMNS } from "@/api/types";

function client() {
  return createMockClient({ latencyMs: [0, 0], storage: null });
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

  it("gives a tap at a station without passport settings no_game and a null name", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const me = await api.me();
    expect(me.recent_taps[0]).toMatchObject({ station_name: null, status: "no_game" });
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
    const text = await (await api.exportCsv()).text();
    const [header, ...rows] = text.trim().split("\n");

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

  it("leaves station_name and display_name empty when the tap has neither", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const text = await (await api.exportCsv()).text();
    const header = text.trim().split("\n")[0]!.split(",");
    const stationNameAt = header.indexOf("station_name");
    const displayNameAt = header.indexOf("display_name");

    const guestRow = text
      .trim()
      .split("\n")
      .slice(1)
      .find((line) =>
        line.startsWith(`${api.mock.data.taps.find((t) => t.user_id === "u_9d4f")!.id},`),
      );
    expect(guestRow?.split(",")[displayNameAt]).toBe("");

    const noGameRow = text
      .trim()
      .split("\n")
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
