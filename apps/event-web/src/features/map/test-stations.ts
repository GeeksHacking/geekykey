import type { MapStation } from "@/api/types";

/** A station as 9.10 lists it, for the map's tests. */
export function mapStation(overrides: Partial<MapStation> & { station_id: string }): MapStation {
  return {
    game: "passport",
    name: "3D Printing Booth",
    booth: null,
    disabled: false,
    taps: 0,
    unique_participants: 0,
    last_tap_at: null,
    ...overrides,
  };
}
