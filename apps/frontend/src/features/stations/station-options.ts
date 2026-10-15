import type { EventStationBoardStation } from "@/api/types";

/**
 * What a station picker needs: which station to send, what to call it, and whether it is
 * answering. Not a wire shape, so it does not live in `@/api/types`, which mirrors the
 * agreement field for field.
 */
export interface StationOption {
  id: string;
  name: string;
  online: boolean;
}

/**
 * Stations with passport settings, by passport name.
 *
 * The QR fallback offers these, because 9.4 answers `not_found` for a station without
 * passport settings, so a fallback tap cannot be filed against one.
 */
export function passportStationOptions(
  stations: readonly EventStationBoardStation[],
): StationOption[] {
  return stations.flatMap((station) =>
    station.passport
      ? [{ id: station.id, name: station.passport.name, online: station.online }]
      : [],
  );
}

/**
 * Every station, by passport name where it has one and by its label otherwise.
 *
 * The scan-log filter offers these, so an organiser can filter the log by a station that has
 * no passport settings yet. Agreement 9.2 calls the label the device's name, which is the
 * only name such a station has.
 */
export function allStationOptions(stations: readonly EventStationBoardStation[]): StationOption[] {
  return stations.map((station) => ({
    id: station.id,
    name: station.passport?.name ?? station.label,
    online: station.online,
  }));
}
