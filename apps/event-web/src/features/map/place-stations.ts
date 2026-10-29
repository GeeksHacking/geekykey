import type { MapStation } from "@/api/types";
import type { Booth, FloorPlan } from "@/features/map/floor-plan";

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

/** How far apart, in plan units, the markers of two stations at the same booth sit. */
const SHARED_BOOTH_GAP = 40;

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

  const placed = [...atBooth].flatMap(([booth, sharing]) =>
    sharing.map((station, index) => ({
      station,
      booth,
      x: booth.x + (index - (sharing.length - 1) / 2) * SHARED_BOOTH_GAP,
      y: booth.y,
    })),
  );
  return { placed, unplaced };
}
