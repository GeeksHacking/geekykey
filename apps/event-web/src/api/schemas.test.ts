import { describe, expect, it } from "vitest";

import { NetworkError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import {
  eventStationBoardResponseSchema,
  meResponseSchema,
  parseEventStationBoardResponse,
  parseGroupBoardResponse,
  parseFallbackTapResponse,
  parseListTapsResponse,
  parseMeResponse,
  parseSetStationPassportResponse,
  parseStationKeyResponse,
  parseStationResponse,
  parseStatsResponse,
  parseMapResponse,
  setDisplayNameResponseSchema,
  updateMeResponseSchema,
} from "@/api/schemas";
import { makeMe } from "@/test/make-me";

describe("me response contract", () => {
  it("validates the participant fixture returned by the mock", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const me = await api.me();

    expect(meResponseSchema.safeParse(me).success).toBe(true);
    expect(parseMeResponse(me)).toEqual(me);
  });

  it("reads the answers game's questions, the user's answers and their connections", () => {
    const parsed = parseMeResponse(
      makeMe({
        user: { answers: { drink: "tea" } },
        questions: [
          {
            id: "drink",
            text: "Tea or coffee?",
            choices: [
              { id: "tea", text: "Tea" },
              { id: "coffee", text: "Coffee" },
            ],
          },
        ],
        connections: [
          {
            connected_at: "2026-11-12T08:12:30.000Z",
            display_name: "Mei Lin",
            bio: null,
            contact_line: null,
            kind: "B",
            match: 60,
            shared: null,
            shared_at: "2026-11-12T08:14:30.000Z",
          },
        ],
      }),
    );

    expect(parsed.questions?.[0]?.choices).toHaveLength(2);
    expect(parsed.user.answers).toEqual({ drink: "tea" });
    expect(parsed.connections[0]?.match).toBe(60);
  });

  it("accepts no questions and no connections", () => {
    const parsed = parseMeResponse(makeMe());

    expect(parsed.questions).toBeNull();
    expect(parsed.connections).toEqual([]);
  });

  it("reads connection requests, and treats a missing list as none (BAC-149)", () => {
    const request = {
      id: "cr_3f1a",
      display_name: "Mei Lin Koh",
      bio: null,
      requested_at: "2026-11-12T08:00:00.000Z",
    };
    expect(parseMeResponse(makeMe({ connection_requests: [request] })).connection_requests).toEqual(
      [request],
    );
    expect(
      parseMeResponse({ ...makeMe(), connection_requests: undefined }).connection_requests,
    ).toEqual([]);
    expect(() =>
      parseMeResponse({ ...makeMe(), connection_requests: [{ ...request, id: 7 }] }),
    ).toThrow(NetworkError);
  });

  it("reads a request's bio, and treats a missing one as none (BAC-151)", () => {
    const request = {
      id: "6f1c2a9e",
      display_name: "Mei Lin",
      requested_at: "2026-11-12T08:00:00.000Z",
    };
    const bioOf = (fields: object) =>
      parseMeResponse({ ...makeMe(), connection_requests: [{ ...request, ...fields }] })
        .connection_requests[0]?.bio;

    expect(bioOf({ bio: "Sensors and sourdough" })).toBe("Sensors and sourdough");
    expect(bioOf({ bio: null })).toBeNull();
    expect(bioOf({})).toBeNull();
    expect(() => bioOf({ bio: 7 })).toThrow(NetworkError);
  });

  it("reads a bio and a contact line, and treats missing ones as none (BAC-147)", () => {
    const connection = {
      connected_at: "2026-11-12T08:12:30.000Z",
      kind: "B",
      match: 60,
      shared: null,
      shared_at: "2026-11-12T08:14:30.000Z",
    };
    const { bio, contact_line, ...userBefore } = makeMe().user;
    expect([bio, contact_line]).toEqual([null, null]);
    const before = parseMeResponse({
      ...makeMe(),
      user: userBefore,
      connections: [connection],
    });
    expect(before.user).toMatchObject({ bio: null, contact_line: null });
    expect(before.connections[0]).toMatchObject({ bio: null, contact_line: null });

    const given = { bio: "Robot arms", contact_line: "@alex" };
    const after = parseMeResponse({
      ...makeMe(),
      user: { ...makeMe().user, ...given },
      connections: [{ ...connection, ...given }],
    });
    expect(after.user).toMatchObject(given);
    expect(after.connections[0]).toMatchObject(given);
  });

  it("reads a connection with no kind, made across groups (BAC-140)", () => {
    const parsed = parseMeResponse({
      ...makeMe(),
      connections: [
        {
          connected_at: "2026-11-05T09:12:30.000Z",
          kind: null,
          match: null,
          shared: null,
          shared_at: "2026-11-05T09:14:30.000Z",
        },
      ],
    });
    expect(parsed.connections[0]?.kind).toBeNull();
  });

  it("reads the board's connection setting, and refuses one it doesn't know (BAC-140)", () => {
    const board = {
      allocation_started_at: null,
      connect_across: "groups",
      joined_count: 0,
      groups: [],
      waiting: [],
    };
    expect(parseGroupBoardResponse(board).connect_across).toBe("groups");
    expect(() => parseGroupBoardResponse({ ...board, connect_across: "houses" })).toThrow(
      NetworkError,
    );
  });

  it("refuses a question without choices and a match outside 0 to 100", () => {
    const base = makeMe();
    const connection = {
      connected_at: "2026-11-12T08:12:30.000Z",
      kind: "B",
      match: 60,
      shared: null,
      shared_at: "2026-11-12T08:14:30.000Z",
    };

    expect(() =>
      parseMeResponse({ ...base, questions: [{ id: "drink", text: "Tea or coffee?" }] }),
    ).toThrow(NetworkError);
    expect(() =>
      parseMeResponse({ ...base, connections: [{ ...connection, match: 101 }] }),
    ).toThrow(NetworkError);
    expect(() => parseMeResponse({ ...base, connections: [{ ...connection, match: -1 }] })).toThrow(
      NetworkError,
    );
    expect(() =>
      parseMeResponse({ ...base, user: { ...base.user, answers: { drink: 1 } } }),
    ).toThrow(NetworkError);
  });

  it("parses PATCH /me's answer for the name or the answers", () => {
    const user = {
      id: "u",
      display_name: "Alex",
      role: "participant",
      has_name: true,
      answers: { drink: "tea" },
    };

    expect(updateMeResponseSchema.safeParse({ user }).success).toBe(true);
    expect(setDisplayNameResponseSchema.safeParse({ user }).success).toBe(true);
  });

  it("ignores unknown legacy fields until the backend checkpoint removes them", () => {
    const parsed = parseMeResponse({ ...makeMe(), legacy_field: "ignored" });

    expect(parsed).not.toHaveProperty("legacy_field");
  });

  it("accepts no_game and rejects station-only statuses", () => {
    const base = makeMe();
    const noGame = parseMeResponse({
      ...base,
      recent_taps: [
        {
          id: 1,
          station_id: "s1",
          station_name: null,
          status: "no_game",
          source: "nfc",
          tapped_at: null,
          received_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    expect(noGame.recent_taps[0]?.status).toBe("no_game");
    expect(noGame.recent_taps[0]?.station_name).toBeNull();

    expect(() =>
      parseMeResponse({
        ...base,
        recent_taps: [{ ...noGame.recent_taps[0], status: "unknown_token" }],
      }),
    ).toThrow(NetworkError);
    expect(() =>
      parseMeResponse({
        ...base,
        recent_taps: [{ ...noGame.recent_taps[0], status: "no_event" }],
      }),
    ).toThrow(NetworkError);
  });

  it("validates the station board", () => {
    const board = {
      stations: [
        {
          id: "s1",
          label: "Station 1",
          created_at: "2026-10-01T02:00:00.000Z",
          disabled_at: null,
          // No game and no booth yet: 9.2 gives both as null, and game_fixed false.
          game: null,
          game_fixed: false,
          booth: null,
          passport: null,
          // A station created by 9.7 and not yet heard from: no hand-off, so no
          // last_seen_at, and it reads as offline.
          last_seen_at: null,
          online: false,
          firmware_version: null,
          buffered_taps: 0,
          reader_ok: null,
          last_tap_at: null,
        },
      ],
    };

    expect(eventStationBoardResponseSchema.safeParse(board).success).toBe(true);
    expect(parseEventStationBoardResponse(board)).toEqual(board);
  });

  it("keeps a station's game, game_fixed and booth, which 9.2 added in version 0.7", () => {
    const board = {
      stations: [
        {
          id: "s1",
          label: "Station 1",
          created_at: "2026-10-01T02:00:00.000Z",
          disabled_at: null,
          game: "passport",
          game_fixed: true,
          booth: "A3",
          passport: {
            name: "3D Printing Booth",
            location: "Hall A",
            points: 1,
            link: "https://example.com/3d-printing",
            added_at: "2026-10-01T02:00:00.000Z",
          },
          last_seen_at: "2026-10-10T09:00:01.250Z",
          online: true,
          firmware_version: "0.3.1",
          buffered_taps: 0,
          reader_ok: true,
          last_tap_at: null,
        },
      ],
    };

    const parsed = parseEventStationBoardResponse(board);
    expect(parsed.stations[0]?.game).toBe("passport");
    expect(parsed.stations[0]?.game_fixed).toBe(true);
    expect(parsed.stations[0]?.booth).toBe("A3");
  });

  it("drops the fields version 0.3 removed, rather than passing them on", () => {
    const station = {
      id: "s1",
      label: "Station 1",
      created_at: "2026-10-01T02:00:00.000Z",
      disabled_at: null,
      game: null,
      game_fixed: false,
      booth: null,
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: 0,
      reader_ok: null,
      last_tap_at: null,
    };

    // The schema is not strict, so a service still sending the old fields parses and they
    // are dropped. Nothing downstream can read them, which is what acceptance criterion 1
    // asks for.
    const parsed = parseEventStationBoardResponse({
      status_known: true,
      stations: [{ ...station, linked: true }],
    });
    expect(parsed).not.toHaveProperty("status_known");
    expect(parsed.stations[0]).not.toHaveProperty("linked");
  });

  it("rejects a station that is missing created_at or disabled_at, or nulls a required field", () => {
    const station = {
      id: "s1",
      label: "Station 1",
      created_at: "2026-10-01T02:00:00.000Z",
      disabled_at: null,
      game: null,
      game_fixed: false,
      booth: null,
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: 0,
      reader_ok: null,
      last_tap_at: null,
    };

    // The two new fields are required, disabled_at included: 9.2 sends null while enabled.
    expect(
      eventStationBoardResponseSchema.safeParse({
        stations: [{ ...station, created_at: undefined }],
      }).success,
    ).toBe(false);
    expect(
      eventStationBoardResponseSchema.safeParse({
        stations: [{ ...station, disabled_at: undefined }],
      }).success,
    ).toBe(false);
    // label and online went from nullable to always present.
    expect(
      eventStationBoardResponseSchema.safeParse({ stations: [{ ...station, label: null }] })
        .success,
    ).toBe(false);
    expect(
      eventStationBoardResponseSchema.safeParse({ stations: [{ ...station, online: null }] })
        .success,
    ).toBe(false);
    // 9.2 gives each station all three since version 0.7, so a service that leaves one out is
    // in the wrong shape rather than in an older one.
    expect(
      eventStationBoardResponseSchema.safeParse({
        stations: [{ ...station, game: undefined }],
      }).success,
    ).toBe(false);
    expect(
      eventStationBoardResponseSchema.safeParse({
        stations: [{ ...station, game_fixed: undefined }],
      }).success,
    ).toBe(false);
    expect(
      eventStationBoardResponseSchema.safeParse({
        stations: [{ ...station, booth: undefined }],
      }).success,
    ).toBe(false);
  });

  it("rejects a response with a missing required field", () => {
    expect(() =>
      parseMeResponse({ user: { id: "u", display_name: "U", role: "participant" } }),
    ).toThrow(NetworkError);
  });
});

describe("organizer response contract", () => {
  /** A station as the board lists it (9.2), which 9.7 to 9.9 answer with. */
  const station = {
    id: "s1",
    label: "Reader 3",
    created_at: "2026-10-01T02:00:00.000Z",
    disabled_at: null,
    game: null,
    game_fixed: false,
    booth: null,
    passport: null,
    last_seen_at: null,
    online: false,
    firmware_version: null,
    buffered_taps: null,
    reader_ok: null,
    last_tap_at: null,
  };

  it("validates the stats as agreement 9.5 gives them", () => {
    const stats = {
      total_taps: 412,
      accepted_taps: 380,
      unique_participants: 96,
      stations: [
        {
          station_id: "s1",
          name: "3D Printing Booth",
          accepted_taps: 120,
          unique_participants: 88,
        },
      ],
    };

    expect(parseStatsResponse(stats)).toEqual(stats);
    expect(() => parseStatsResponse({ ...stats, total_taps: "412" })).toThrow(NetworkError);
  });

  it("validates the map as agreement 9.10 gives it", () => {
    const map = {
      stations: [
        {
          station_id: "s1",
          game: "passport",
          name: "3D Printing Booth",
          booth: "A3",
          disabled: false,
          taps: 57,
          unique_participants: 41,
          last_tap_at: "2026-10-10T08:58:12.004Z",
        },
        {
          station_id: "s2",
          game: null,
          name: null,
          booth: null,
          disabled: false,
          taps: 0,
          unique_participants: 0,
          last_tap_at: null,
        },
      ],
    };

    expect(parseMapResponse(map)).toEqual(map);
    expect(() => parseMapResponse({ stations: [{ ...map.stations[0], taps: -1 }] })).toThrow(
      NetworkError,
    );

    const withConnections = {
      ...map,
      connections: {
        count: 2,
        links: [
          [1, 2],
          [1, 3],
        ],
      },
    };
    expect(parseMapResponse(withConnections)).toEqual(withConnections);
    expect(() => parseMapResponse({ ...map, connections: { count: 1, links: [[1]] } })).toThrow(
      NetworkError,
    );
    expect(() => parseMapResponse({ ...map, connections: { count: -1, links: [] } })).toThrow(
      NetworkError,
    );
  });

  it("validates a page of the tap log as agreement 9.3 gives it", () => {
    const page = {
      taps: [
        {
          id: 42,
          client_tap_id: "tap-000123",
          station: { id: "s1", name: "3D Printing Booth" },
          user: { id: "dev-user-1", display_name: "Alex" },
          status: "accepted",
          source: "nfc",
          tapped_at: "2026-10-10T09:00:00.000Z",
          received_at: "2026-10-10T09:00:01.250Z",
        },
        {
          // A QR fallback at a station without passport settings, for someone who has
          // never logged in to this event: every null 9.3 allows.
          id: 41,
          client_tap_id: "6f1c2e4a-8d3b-4f7a-9c0e-1b2d3e4f5a6b",
          station: { id: "s2", name: null },
          user: { id: "dev-user-2", display_name: null },
          status: "no_game",
          source: "qr_fallback",
          tapped_at: null,
          received_at: "2026-10-10T08:59:00.000Z",
        },
      ],
      next_before_id: 41,
    };

    expect(parseListTapsResponse(page)).toEqual(page);
    expect(parseListTapsResponse({ taps: [], next_before_id: null })).toEqual({
      taps: [],
      next_before_id: null,
    });
    // The log holds stored taps only, and every one has a user.
    expect(() =>
      parseListTapsResponse({ ...page, taps: [{ ...page.taps[0], status: "duplicate" }] }),
    ).toThrow(NetworkError);
    expect(() =>
      parseListTapsResponse({ ...page, taps: [{ ...page.taps[0], user: null }] }),
    ).toThrow(NetworkError);
  });

  it("validates a QR fallback's result as agreement 9.4 gives it", () => {
    const answer = { result: { id: 43, status: "accepted" } };

    expect(parseFallbackTapResponse(answer)).toEqual(answer);
    expect(parseFallbackTapResponse({ result: { id: 44, status: "cooldown" } })).toEqual({
      result: { id: 44, status: "cooldown" },
    });
    // 9.4 refuses a station without passport settings, so a fallback is never no_game.
    expect(() => parseFallbackTapResponse({ result: { id: 45, status: "no_game" } })).toThrow(
      NetworkError,
    );
  });

  it("validates a station and its key as agreement 9.7 and 9.8 give them", () => {
    const answer = { station, api_key: "gk_sta_DuY" };

    expect(parseStationKeyResponse(answer)).toEqual(answer);
    expect(() => parseStationKeyResponse({ station })).toThrow(NetworkError);
    expect(() =>
      parseStationKeyResponse({ ...answer, station: { ...station, online: null } }),
    ).toThrow(NetworkError);
  });

  it("validates a disabled or enabled station as agreement 9.9 gives it", () => {
    const disabled = { station: { ...station, disabled_at: "2026-10-10T09:00:00.000Z" } };

    expect(parseStationResponse(disabled)).toEqual(disabled);
    expect(parseStationResponse({ station })).toEqual({ station });
    expect(() => parseStationResponse({ station: { ...station, disabled_at: undefined } })).toThrow(
      NetworkError,
    );
  });

  it("validates passport settings as agreement 9.1 gives them", () => {
    const answer = {
      passport: {
        station_id: "s1",
        name: "3D Printing Booth",
        location: null,
        points: 1,
        link: "https://example.com/3d-printing",
        added_at: "2026-10-10T09:00:00.000Z",
      },
    };

    expect(parseSetStationPassportResponse(answer)).toEqual(answer);
    // 9.1 adds booth to the answer once checkpoint 7's map is built. Until the screens
    // read it, an answer with it still parses.
    expect(
      parseSetStationPassportResponse({ passport: { ...answer.passport, booth: "A3" } }),
    ).toEqual(answer);
    expect(() =>
      parseSetStationPassportResponse({ passport: { ...answer.passport, station_id: undefined } }),
    ).toThrow(NetworkError);
  });
});

describe("the answers game and connections in /me (agreement 0.13 draft, 8.1)", () => {
  const me = {
    user: {
      id: "u",
      display_name: "U",
      role: "participant",
      has_name: true,
      answers: { drink: "tea" },
      bio: "Robot arms",
      contact_line: "@alex",
    },
    questions: [
      {
        id: "drink",
        text: "Tea or coffee?",
        choices: [
          { id: "tea", text: "Tea" },
          { id: "coffee", text: "Coffee" },
        ],
      },
    ],
    points: 2,
    stamps: [],
    recent_taps: [],
    connection_requests: [],
    connections: [
      {
        connected_at: "2026-11-12T08:12:30.000Z",
        display_name: "Mei Lin",
        bio: null,
        contact_line: null,
        kind: "B",
        match: 50,
        dice: { your_roll: 5, their_roll: 2, result: "win" },
        shared: null,
        shared_at: "2026-11-12T08:14:30.000Z",
      },
      {
        connected_at: "2026-11-12T08:00:00.000Z",
        display_name: null,
        bio: null,
        contact_line: null,
        kind: "G",
        match: null,
        shared: [],
        shared_at: "2026-11-12T08:02:00.000Z",
        dice: null,
      },
    ],
  };

  it("keeps the questions, the answers and each connection's fields", () => {
    expect(parseMeResponse(me)).toEqual(me);
  });

  it("reads a connection from a service before dice as no rolls", () => {
    const { dice: _dice, ...connection } = me.connections[0]!;
    expect(parseMeResponse({ ...me, connections: [connection] }).connections[0]?.dice).toBeNull();
  });

  it.each([
    { your_roll: 0, their_roll: 2, result: "loss" },
    { your_roll: 7, their_roll: 2, result: "win" },
    { your_roll: 2, their_roll: 0, result: "win" },
    { your_roll: 2, their_roll: 7, result: "loss" },
    { your_roll: 2.5, their_roll: 2, result: "win" },
    { your_roll: 2, their_roll: 2, result: "draw" },
    { your_roll: 2, result: "win" },
  ])("refuses invalid dice %j", (dice) => {
    const connection = { ...me.connections[0], dice };
    expect(() => parseMeResponse({ ...me, connections: [connection] })).toThrow(NetworkError);
  });

  it("takes an event with no answers game", () => {
    expect(parseMeResponse({ ...me, questions: null, connections: [] }).questions).toBeNull();
  });

  it("refuses an answer without connections or questions", () => {
    expect(() => parseMeResponse({ ...me, connections: undefined })).toThrow(NetworkError);
    expect(() => parseMeResponse({ ...me, questions: undefined })).toThrow(NetworkError);
  });

  it("refuses a match outside 0 to 100", () => {
    const connection = { ...me.connections[0], match: 101 };
    expect(() => parseMeResponse({ ...me, connections: [connection] })).toThrow(NetworkError);
  });

  it("reads a connection with no name from a service before BAC-136 as no name", () => {
    const { display_name: _name, ...connection } = me.connections[0]!;
    const parsed = parseMeResponse({ ...me, connections: [connection] });
    expect(parsed.connections[0]?.display_name).toBeNull();
  });

  it("refuses a connection's name that isn't a string", () => {
    const connection = { ...me.connections[0], display_name: 7 };
    expect(() => parseMeResponse({ ...me, connections: [connection] })).toThrow(NetworkError);
  });
});

describe("the rules each field carries", () => {
  const me = {
    ...makeMe({ user: { display_name: null, has_name: false } }),
    points: 7,
    stamps: [
      {
        station_id: "s1",
        name: "3D Printing Booth",
        location: null,
        points: 3,
        link: "https://example.com/3d-printing",
        earned_at: "2026-10-10T17:04:00+08:00",
      },
    ],
    recent_taps: [],
  };

  it("takes a time with a Z or an offset, and refuses one with neither", () => {
    expect(parseMeResponse(me).stamps[0]?.earned_at).toBe("2026-10-10T17:04:00+08:00");
    expect(() =>
      parseMeResponse({ ...me, stamps: [{ ...me.stamps[0], earned_at: "2026-10-10T17:04:00" }] }),
    ).toThrow(NetworkError);
  });

  it("refuses points that are negative or not whole", () => {
    expect(() => parseMeResponse({ ...me, points: -1 })).toThrow(NetworkError);
    expect(() => parseMeResponse({ ...me, points: 1.5 })).toThrow(NetworkError);
    expect(() => parseMeResponse({ ...me, stamps: [{ ...me.stamps[0], points: -3 }] })).toThrow(
      NetworkError,
    );
  });

  it("refuses a count below zero and an ID that is not whole", () => {
    expect(() =>
      parseStatsResponse({
        total_taps: 0,
        accepted_taps: -1,
        unique_participants: 0,
        stations: [],
      }),
    ).toThrow(NetworkError);
    expect(() => parseFallbackTapResponse({ result: { id: 43.5, status: "accepted" } })).toThrow(
      NetworkError,
    );
    expect(() => parseListTapsResponse({ taps: [], next_before_id: 41.5 })).toThrow(NetworkError);
  });

  it("takes a station whose buffer count is unknown, and refuses a negative one", () => {
    const station = {
      id: "s1",
      label: "Reader 3",
      created_at: "2026-10-01T02:00:00.000Z",
      disabled_at: null,
      game: null,
      game_fixed: false,
      booth: null,
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: null,
      reader_ok: null,
      last_tap_at: null,
    };

    expect(parseStationResponse({ station }).station.buffered_taps).toBeNull();
    expect(() => parseStationResponse({ station: { ...station, buffered_taps: -2 } })).toThrow(
      NetworkError,
    );
  });
});
