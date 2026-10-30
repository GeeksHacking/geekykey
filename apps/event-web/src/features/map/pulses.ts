import type { MapStation } from "@/api/types";

/**
 * The most pulses one station plays for one poll. Taps that reach the server inside one poll
 * each get a pulse, up to this many, so a burst shows as a burst but a busy station doesn't
 * queue pulses past the next poll.
 */
export const MAX_PULSES_PER_POLL = 3;

/** A station to pulse, and how many times. */
interface StationPulse {
  stationId: string;
  count: number;
}

/**
 * The stations whose `taps` went up between two polls of the map (agreement 9.10), each with
 * one pulse per new tap, up to MAX_PULSES_PER_POLL. A first poll has nothing to compare with,
 * so it pulses nothing, and neither does a station that is new since the last poll. A disabled
 * station never pulses, even when a QR fallback tap raises its count. The map plays what this
 * returns and decides nothing else.
 */
export function stationsToPulse(
  previous: readonly MapStation[] | undefined,
  next: readonly MapStation[],
): StationPulse[] {
  if (!previous) return [];
  const before = new Map(previous.map((station) => [station.station_id, station.taps]));
  return next.flatMap((station) => {
    const taps = before.get(station.station_id);
    if (station.disabled || taps === undefined || station.taps <= taps) return [];
    const count = Math.min(station.taps - taps, MAX_PULSES_PER_POLL);
    return [{ stationId: station.station_id, count }];
  });
}
