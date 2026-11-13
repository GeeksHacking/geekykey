import type { MapRelayResponse } from "@/api/types";

export function relayPoll(
  patch: Partial<NonNullable<NonNullable<MapRelayResponse["relay"]>["game"]>> = {},
): MapRelayResponse {
  return {
    relay: {
      stations: ["s1", "s2"],
      game: {
        started_at: "2026-11-17T06:00:00.000Z",
        transfers: 2,
        transfers_needed: 4,
        calling_station_id: "s1",
        waiting_station_id: "s2",
        waiting_until: "2026-11-17T06:00:20.000Z",
        ended_at: null,
        complete: false,
        ...patch,
      },
    },
  };
}
