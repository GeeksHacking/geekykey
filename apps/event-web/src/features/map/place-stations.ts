import type { MapStation } from "@/api/types";
import type { Booth, FloorPlan } from "@/features/map/floor-plan";
import { markerWidth } from "@/features/map/marker-size";

export interface PlacedStation {
  station: MapStation;
  booth: Booth;
  /** Where its marker goes, in plan units. Beside its booth when another station shares it. */
  x: number;
  y: number;
}

export interface Placement {
  placed: PlacedStation[];
  /** No booth, or one the plan doesn't name. Listed beside the map, so an organizer notices. */
  unplaced: MapStation[];
}

/** The space, in plan units, between the markers of two stations at the same booth. */
const SHARED_BOOTH_GAP = 8;

/**
 * Puts each station at its booth. A booth matches a name in the plan whatever its case, since
 * an organizer types it. Agreement 9.10 has the screen treat a booth its plan doesn't name the
 * same as none, so both kinds go to `unplaced` rather than off the map.
 */
export function placeStations(stations: readonly MapStation[], plan: FloorPlan): Placement {
  const booths = new Map(plan.booths.map((booth) => [booth.name.toUpperCase(), booth]));
  const atBooth = new Map<Booth, MapStation[]>();
  const unplaced: MapStation[] = [];

  for (const station of stations) {
    const booth = station.booth ? booths.get(station.booth.trim().toUpperCase()) : undefined;
    if (!booth) {
      unplaced.push(station);
      continue;
    }
    atBooth.set(booth, [...(atBooth.get(booth) ?? []), station]);
  }

  // Stations sharing a booth sit in a row centred on it, each as wide as its marker, so their
  // rings and counts never overlap.
  const placed = [...atBooth].flatMap(([booth, sharing]) => {
    const widths = sharing.map((station) => markerWidth(station) + SHARED_BOOTH_GAP);
    let left = booth.x - widths.reduce((sum, width) => sum + width, 0) / 2;
    return sharing.map((station, index) => {
      const width = widths[index] ?? 0;
      const x = left + width / 2;
      left += width;
      return { station, booth, x, y: booth.y };
    });
  });
  return { placed, unplaced };
}
