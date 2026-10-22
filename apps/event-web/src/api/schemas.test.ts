import { describe, expect, it } from "vitest";

import { NetworkError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import {
  eventStationBoardResponseSchema,
  meResponseSchema,
  parseEventStationBoardResponse,
  parseMeResponse,
} from "@/api/schemas";

describe("me response contract", () => {
  it("validates the participant fixture returned by the mock", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const me = await api.me();

    expect(meResponseSchema.safeParse(me).success).toBe(true);
    expect(parseMeResponse(me)).toEqual(me);
  });

  it("ignores unknown legacy fields until the backend checkpoint removes them", () => {
    const parsed = parseMeResponse({
      user: { id: "u", display_name: "U", role: "participant", has_name: true },
      legacy_field: "ignored",
      points: 0,
      stamps: [],
      recent_taps: [],
    });

    expect(parsed).not.toHaveProperty("legacy_field");
  });

  it("accepts no_game and rejects station-only statuses", () => {
    const base = {
      user: { id: "u", display_name: "U", role: "participant", has_name: true },
      points: 0,
      stamps: [],
    };
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

  it("drops the fields version 0.3 removed, rather than passing them on", () => {
    const station = {
      id: "s1",
      label: "Station 1",
      created_at: "2026-10-01T02:00:00.000Z",
      disabled_at: null,
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
  });

  it("rejects a response with a missing required field", () => {
    expect(() =>
      parseMeResponse({ user: { id: "u", display_name: "U", role: "participant" } }),
    ).toThrow(NetworkError);
  });
});
