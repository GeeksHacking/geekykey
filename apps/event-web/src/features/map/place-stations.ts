import type { MapStation } from "@/api/types";
import type { Booth, FloorPlan } from "@/features/map/floor-plan";
import { markerWidth } from "@/features/map/marker-size";
import type { SeatMark } from "@/features/map/seat-marks";

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
export function placeStations(
  stations: readonly MapStation[],
  plan: FloorPlan,
  seatMarks?: ReadonlyMap<string, SeatMark>,
): Placement {
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

  // Each booth gets the space halfway to its neighbours. Wrap crowded booths so pills and
  // the waiting square stay inside the table; leave single stations at their original spot.
  const placed = [...atBooth].flatMap(([booth, sharing]) => {
    const before = plan.booths.filter((other) => other.x < booth.x);
    const after = plan.booths.filter((other) => other.x > booth.x);
    const min = before.length ? (Math.max(...before.map((other) => other.x)) + booth.x) / 2 + 4 : 4;
    const max = after.length
      ? (Math.min(...after.map((other) => other.x)) + booth.x) / 2 - 4
      : plan.width - 4;
    const rows: { station: MapStation; width: number }[][] = [[]];
    let used = 0;
    for (const station of sharing) {
      const width = markerWidth(station, seatMarks?.get(station.station_id));
      if (used && used + SHARED_BOOTH_GAP + width > max - min) {
        rows.push([]);
        used = 0;
      }
      rows[rows.length - 1]?.push({ station, width });
      used += (used ? SHARED_BOOTH_GAP : 0) + width;
    }
    return rows.flatMap((row, rowIndex) => {
      const width =
        row.reduce((sum, item) => sum + item.width, 0) + (row.length - 1) * SHARED_BOOTH_GAP;
      let left = Math.max(min, Math.min(booth.x - width / 2, max - width));
      return row.map(({ station, width }) => {
        const x = left + width / 2;
        left += width + SHARED_BOOTH_GAP;
        // A row includes the call above its square and both pills below it.
        return { station, booth, x, y: booth.y + rowIndex * 210 };
      });
    });
  });
  return { placed, unplaced };
}
