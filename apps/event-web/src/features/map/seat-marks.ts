import type { MapStation } from "@/api/types";

/** The map's mark for a station with an open seat, or one taken on the previous poll. */
export interface SeatMark {
  state: "open" | "taken";
  /** The whole seconds left while open, or 0 when taken. */
  seconds: number;
}

/** What the marker and the station's row say. */
export function seatText(mark: SeatMark): string {
  if (mark.state === "taken") return "Taken";
  return mark.seconds > 0 ? `Open seat ${mark.seconds}s` : "Open seat";
}

/**
 * The open seat marks for this poll (BAC-190, FRO-180). `open_seat_until` only exists while the
 * seat is open, so a station that had one on the previous poll and has none now, before its
 * closing time, shows "Taken" for this poll. A seat that reached its closing time clears without
 * it. The map's own 2-second poll is the only request.
 */
export function seatMarks(
  previous: readonly MapStation[] | undefined,
  current: readonly MapStation[],
  now: number,
): Map<string, SeatMark> {
  const before = new Map(
    (previous ?? []).map((station) => [station.station_id, station.open_seat_until ?? null]),
  );
  const marks = new Map<string, SeatMark>();

  for (const station of current) {
    const until = station.open_seat_until ?? null;
    if (until) {
      marks.set(station.station_id, {
        state: "open",
        seconds: Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)),
      });
      continue;
    }
    const was = before.get(station.station_id);
    if (was && Date.parse(was) > now) {
      marks.set(station.station_id, { state: "taken", seconds: 0 });
    }
  }

  return marks;
}
