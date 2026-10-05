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
      user: { id: "u", display_name: "U", role: "participant" },
      legacy_field: "ignored",
      points: 0,
      stamps: [],
      recent_taps: [],
    });

    expect(parsed).not.toHaveProperty("legacy_field");
  });

  it("accepts no_game and rejects station-only statuses", () => {
    const base = {
      user: { id: "u", display_name: "U", role: "participant" },
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

  it("validates the v0.2 station board", () => {
    const board = {
      status_known: true,
      stations: [
        {
          id: "s1",
          label: "Reader 1",
          linked: true,
          passport: null,
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

  it("rejects a response with a missing required field", () => {
    expect(() =>
      parseMeResponse({ user: { id: "u", display_name: "U", role: "participant" } }),
    ).toThrow(NetworkError);
  });
});
