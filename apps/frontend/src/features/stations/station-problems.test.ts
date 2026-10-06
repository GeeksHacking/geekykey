import { describe, expect, it } from "vitest";

import type { EventStationBoardStation } from "@/api/types";
import {
  hasStationProblem,
  sortStationsByTrouble,
  stationProblems,
  STATION_PROBLEMS,
} from "@/features/stations/station-problems";

/** A station with nothing wrong. Each test changes one field. */
function station(overrides: Partial<EventStationBoardStation> = {}): EventStationBoardStation {
  return {
    id: "station-1",
    label: "Station 1",
    linked: true,
    passport: {
      name: "3D Printing Booth",
      location: "Hall A",
      points: 1,
      added_at: "2026-10-01T00:00:00.000Z",
    },
    last_seen_at: "2026-10-10T09:00:01.250Z",
    online: true,
    firmware_version: "0.3.1",
    buffered_taps: 0,
    reader_ok: true,
    last_tap_at: "2026-10-10T08:58:12.004Z",
    ...overrides,
  };
}

describe("stationProblems", () => {
  it("finds nothing wrong with a healthy station", () => {
    expect(stationProblems(station())).toEqual([]);
    expect(hasStationProblem(station())).toBe(false);
  });

  it("finds a station that is offline", () => {
    expect(stationProblems(station({ online: false }))).toContain("offline");
  });

  it("finds a station holding saved taps", () => {
    expect(stationProblems(station({ buffered_taps: 3 }))).toContain("buffered");
  });

  it("finds a station not in the passport", () => {
    expect(stationProblems(station({ passport: null }))).toContain("notInPassport");
  });

  it("finds a station whose reader is not responding", () => {
    expect(stationProblems(station({ reader_ok: false }))).toContain("readerNotResponding");
  });

  it("finds every problem on a station that has several", () => {
    const broken = station({ online: false, reader_ok: false, buffered_taps: 12, passport: null });

    expect(stationProblems(broken).sort()).toEqual(
      ["buffered", "notInPassport", "offline", "readerNotResponding"].sort(),
    );
  });

  it("lists a dead reader before saved taps, so the worst news reads first", () => {
    const problems = stationProblems(station({ reader_ok: false, buffered_taps: 4 }));

    expect(problems[0]).toBe("readerNotResponding");
    expect(problems[1]).toBe("buffered");
  });

  it("leaves a station that is only quiet alone", () => {
    const quiet = station({ last_tap_at: null, last_seen_at: null });

    expect(stationProblems(quiet)).toEqual([]);
  });

  it("treats an unknown status as unknown, not as a fault", () => {
    // Agreement 9.2: when the status call fails these are all null, and the screen
    // must not show them as offline.
    const unknown = station({
      label: null,
      linked: null,
      last_seen_at: null,
      online: null,
      firmware_version: null,
      buffered_taps: null,
      reader_ok: null,
    });

    expect(stationProblems(unknown)).toEqual([]);
  });

  it("still finds a missing passport when the status is unknown", () => {
    // Passport settings come from the Event Service, so they survive a failed status call.
    const unknown = station({ online: null, reader_ok: null, passport: null });

    expect(stationProblems(unknown)).toEqual(["notInPassport"]);
  });

  it("gives every problem a word to show", () => {
    for (const label of Object.values(STATION_PROBLEMS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("sortStationsByTrouble", () => {
  const healthy = station({ id: "healthy" });
  const quiet = station({ id: "quiet", last_tap_at: null });
  const offline = station({ id: "offline", online: false });
  const buffered = station({ id: "buffered", buffered_taps: 7 });
  const notInPassport = station({ id: "not-in-passport", passport: null });
  const deadReader = station({ id: "dead-reader", reader_ok: false });

  it("puts problem stations before healthy ones", () => {
    const sorted = sortStationsByTrouble([healthy, offline]);

    expect(sorted.map((entry) => entry.id)).toEqual(["offline", "healthy"]);
  });

  it("keeps every problem station above every healthy one", () => {
    const sorted = sortStationsByTrouble([
      healthy,
      quiet,
      deadReader,
      notInPassport,
      buffered,
      offline,
    ]);

    // Trouble to the top; inside each group the order they arrived in is kept.
    expect(sorted.map((entry) => entry.id)).toEqual([
      "dead-reader",
      "not-in-passport",
      "buffered",
      "offline",
      "healthy",
      "quiet",
    ]);
  });

  it("leaves healthy stations in the order they arrived", () => {
    const sorted = sortStationsByTrouble([healthy, quiet, station({ id: "third" })]);

    expect(sorted.map((entry) => entry.id)).toEqual(["healthy", "quiet", "third"]);
  });

  it("does not change the order within the problem group", () => {
    const sorted = sortStationsByTrouble([deadReader, offline, buffered]);

    expect(sorted.map((entry) => entry.id)).toEqual(["dead-reader", "offline", "buffered"]);
  });

  it("returns nothing to complain about for an empty board", () => {
    expect(sortStationsByTrouble([])).toEqual([]);
  });

  it("leaves the caller's array alone", () => {
    const original = [healthy, offline];

    sortStationsByTrouble(original);

    expect(original.map((entry) => entry.id)).toEqual(["healthy", "offline"]);
  });
});
