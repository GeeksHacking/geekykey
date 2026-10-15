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
 * Since version 0.3 the board has no status call behind it, so `online` is always a real
 * answer: whether the station was heard from within the last 120 seconds (agreement 9.2).
 * A station created by 9.7 and not yet heard from is offline, which is true rather than
 * unknown. `reader_ok` and `buffered_taps` stay null until a heartbeat's hand-off reports
 * them, so only a definite `false`, or a count above zero, is a problem. 9.2 is explicit
 * that showing a healthy station as at fault would send an organiser to restart it for no
 * reason. A station that is only quiet has no problem at all.
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
 * Disabled stations last, and problem stations first among the rest (agreement 9.2).
 *
 * 9.2 makes the disabled rule unconditional and lists it separately from the four faults,
 * so it wins: a disabled station that is also offline still goes to the bottom. Both
 * groups keep the order they arrived in, so a poll that returns the same list does not
 * shuffle the board under the reader.
 */
export function sortStationsByTrouble(
  stations: readonly EventStationBoardStation[],
): EventStationBoardStation[] {
  return [...stations].sort((a, b) => {
    const aDisabled = a.disabled_at !== null;
    const bDisabled = b.disabled_at !== null;
    if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
    return Number(hasStationProblem(b)) - Number(hasStationProblem(a));
  });
}
