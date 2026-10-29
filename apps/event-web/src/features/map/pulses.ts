import type { MapStation } from "@/api/types";

/**
 * The stations whose `taps` went up between two polls of the map (agreement 9.10). A first
 * poll has nothing to compare with, so it pulses nothing, and neither does a station that is
 * new since the last poll. A disabled station never pulses, even when a QR fallback tap
 * raises its count. The map plays what this returns and decides nothing else.
 */
export function stationsToPulse(
  previous: readonly MapStation[] | undefined,
  next: readonly MapStation[],
): string[] {
  if (!previous) return [];
  const before = new Map(previous.map((station) => [station.station_id, station.taps]));
  return next
    .filter((station) => {
      const taps = before.get(station.station_id);
      return !station.disabled && taps !== undefined && station.taps > taps;
    })
    .map((station) => station.station_id);
}
