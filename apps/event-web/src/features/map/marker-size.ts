import type { MapStation } from "@/api/types";

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

/** How wide a marker is: its outer ring or its pill, whichever is wider. */
export function markerWidth(station: MapStation): number {
  return Math.max((SPOT_RADIUS + 7) * 2, pillWidth(pillText(station)));
}
