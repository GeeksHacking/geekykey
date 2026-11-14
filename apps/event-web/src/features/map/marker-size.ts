import type { MapStation } from "@/api/types";
import type { SeatMark } from "@/features/map/seat-marks";

/*
  How big a station's marker is on the plan, in plan units. Placing stations at a shared booth
  needs these before anything renders, so they live here rather than in the marker.
*/

/** The spot's radius. The pulse's ring starts at this size. */
export const SPOT_RADIUS = 18;

/** Geist Mono's advance is 0.6 of its size, so a label's width is known before it renders. */
export const PILL_FONT = 14;
export const pillWidth = (text: string) => text.length * PILL_FONT * 0.6 + 16;

/** The words under a station's spot: how many people tapped there, or that it's disabled. */
export const pillText = (station: MapStation) =>
  station.disabled ? "Disabled" : String(station.unique_participants);

/**
 * The widest the open seat's label gets, so a shared booth doesn't shift as the seconds or the
 * state change. The taken label is shorter and keeps the same reserved width.
 */
const OPEN_SEAT_LABEL = "Open seat 60s";

/** The seat pill's reserved width, or 0 without a mark. */
export function seatWidth(seat?: SeatMark): number {
  return seat ? pillWidth(OPEN_SEAT_LABEL) : 0;
}

/** How wide a marker is: its outer ring, its count pill or its seat pill, whichever is wider. */
export function markerWidth(station: MapStation, seat?: SeatMark): number {
  return Math.max((SPOT_RADIUS + 7) * 2, pillWidth(pillText(station)), seatWidth(seat));
}
