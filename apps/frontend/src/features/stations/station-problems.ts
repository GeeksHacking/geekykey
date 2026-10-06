import type { EventStationBoardStation } from "@/api/types";

/**
 * The four faults a station board shows first, in red (agreement 9.2, "Suggested").
 * Each carries the words the row shows, so a fault is never colour alone.
 */
export const STATION_PROBLEMS = {
  offline: "Not responding",
  buffered: "Holding saved taps",
  notInPassport: "Not in the passport",
  readerNotResponding: "Reader not responding",
} as const;

export type StationProblem = keyof typeof STATION_PROBLEMS;

/**
 * Which problems a station has, most urgent first.
 *
 * `online` and `reader_ok` are `null` when the GeekyKey Service's status call failed
 * or timed out (agreement 9.2), so `null` is deliberately not a problem: an unknown
 * status must never make an organiser restart a healthy station. Same for a station
 * that is only quiet, which has no problem at all.
 */
export function stationProblems(station: EventStationBoardStation): StationProblem[] {
  const problems: StationProblem[] = [];

  if (station.online === false) problems.push("offline");
  if (station.reader_ok === false) problems.push("readerNotResponding");
  if ((station.buffered_taps ?? 0) > 0) problems.push("buffered");
  if (station.passport === null) problems.push("notInPassport");

  return problems;
}

export function hasStationProblem(station: EventStationBoardStation): boolean {
  return stationProblems(station).length > 0;
}

/**
 * Problem stations first, then everyone else. Both groups keep the order they arrived
 * in, so a poll that returns the same list does not shuffle the board under the reader.
 */
export function sortStationsByTrouble(
  stations: readonly EventStationBoardStation[],
): EventStationBoardStation[] {
  return [...stations].sort((a, b) => Number(hasStationProblem(b)) - Number(hasStationProblem(a)));
}
