import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EventStationBoardStation } from "@/api/types";
import { StationBoard } from "@/features/stations/station-board";

function station(overrides: Partial<EventStationBoardStation> = {}): EventStationBoardStation {
  return {
    id: "station-1",
    label: "Station 1",
    created_at: "2026-10-01T00:00:00.000Z",
    disabled_at: null,
    passport: {
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      added_at: "2026-10-01T00:00:00.000Z",
    },
    last_seen_at: "2026-10-10T09:00:00.000Z",
    online: true,
    firmware_version: "0.3.1",
    buffered_taps: 0,
    reader_ok: true,
    last_tap_at: "2026-10-10T08:58:00.000Z",
    ...overrides,
  };
}

/** Two faults at once: the station is not answering, and it has taps it has not sent. */
const offlineBuffered = station({
  id: "offline-buffered",
  label: "Station 5",
  online: false,
  buffered_taps: 3,
  reader_ok: true,
  last_tap_at: null,
});

/** Disabled by an organizer, and nothing else wrong with it. Agreement 9.2. */
const disabledStation = station({
  id: "disabled-station",
  label: "Station 7",
  disabled_at: "2026-10-10T09:05:00.000Z",
});

/** Two faults: its reader is not answering, and it has no passport settings. */
const deadReader = station({
  id: "dead-reader",
  label: "Station 3",
  passport: null,
  reader_ok: false,
});

/** In the passport, but nobody has tapped it lately. Being quiet is not a fault. */
const quietStation = station({
  id: "quiet-station",
  passport: {
    name: "Quiet Booth",
    location: "Hall C",
    points: 1,
    added_at: "2026-10-01T00:00:00.000Z",
  },
  last_tap_at: null,
});

/** In the passport, online, reader answering, nothing buffered. */
const healthyStation = station({
  id: "healthy",
  passport: {
    name: "Healthy Booth",
    location: "Hall D",
    points: 1,
    added_at: "2026-10-01T00:00:00.000Z",
  },
});

describe("StationBoard", () => {
  it("shows passport, not-in-passport, and last-tap states", () => {
    render(<StationBoard stations={[offlineBuffered, deadReader]} />);

    expect(screen.getByText("Careers Corner")).toBeInTheDocument();
    expect(screen.getByText("Station 3")).toBeInTheDocument();
    expect(screen.getByText("Not in the passport")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("no longer says 'No longer linked', which cannot happen any more", () => {
    // A station always feeds the Event Service that registered it, so agreement 9.2 has no
    // link field and the old line had nothing left to report.
    render(<StationBoard stations={[offlineBuffered, deadReader, healthyStation]} />);

    expect(screen.queryByText("No longer linked")).not.toBeInTheDocument();
  });

  it("names every problem on a station that has several", () => {
    render(<StationBoard stations={[offlineBuffered]} />);

    expect(screen.getByText("Not responding")).toBeInTheDocument();
    expect(screen.getByText("Holding saved taps")).toBeInTheDocument();
  });

  it("marks a dead reader in words, not colour alone", () => {
    render(<StationBoard stations={[deadReader]} />);

    expect(screen.getByText("Reader not responding")).toBeInTheDocument();
  });

  it("leaves a station that is only quiet uncoloured and unlabelled", () => {
    render(<StationBoard stations={[quietStation]} />);

    expect(screen.getByText("Quiet Booth")).toBeInTheDocument();
    expect(screen.queryByText("Not responding")).not.toBeInTheDocument();
    expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
    expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
  });

  it("says 'Not in the passport' once per station, not twice", () => {
    render(<StationBoard stations={[deadReader]} />);

    expect(screen.getAllByText("Not in the passport")).toHaveLength(1);
  });

  it("puts problem stations above healthy ones, keeping arrival order within each group", () => {
    render(<StationBoard stations={[healthyStation, quietStation, deadReader]} />);

    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

    expect(names[0]).toContain("Station 3");
    expect(names[1]).toContain("Healthy Booth");
    expect(names[2]).toContain("Quiet Booth");
  });

  describe("a disabled station", () => {
    it("shows a Disabled badge", () => {
      render(<StationBoard stations={[disabledStation]} />);

      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    it("leaves an enabled station without the badge", () => {
      render(<StationBoard stations={[healthyStation]} />);

      expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
    });

    it("keeps its slot and its stamps, so its passport name and points still show", () => {
      // Agreement 9.2: disabling does not take the station out of the passport.
      render(<StationBoard stations={[disabledStation]} />);

      expect(screen.getByText("Careers Corner")).toBeInTheDocument();
      expect(screen.getByText("Hall B")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("is not flagged as a problem just for being disabled", () => {
      render(<StationBoard stations={[disabledStation]} />);

      expect(screen.queryByText("Not responding")).not.toBeInTheDocument();
      expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
      expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
    });

    it("goes last, below problem and healthy stations alike", () => {
      render(<StationBoard stations={[disabledStation, healthyStation, deadReader]} />);

      const names = screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent ?? "");

      expect(names[0]).toContain("Station 3");
      expect(names[1]).toContain("Healthy Booth");
      expect(names[2]).toContain("Careers Corner");
    });
  });

  describe("a station that has never been heard from", () => {
    /** What 9.7 registers: a station at once, with no hand-off behind it yet. */
    const fresh = station({
      label: "Station 7",
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: null,
      reader_ok: null,
    });

    it("reads as never connected, not as status unknown", () => {
      render(<StationBoard stations={[fresh]} />);

      expect(screen.getByText("Never connected")).toBeInTheDocument();
      expect(screen.queryByText("Status unknown")).not.toBeInTheDocument();
    });

    it("still shows its label, since a station always has one", () => {
      render(<StationBoard stations={[fresh]} />);

      expect(screen.getByText("Station 7")).toBeInTheDocument();
    });

    it("flags the missing passport and being offline, but not the unreported reader", () => {
      render(<StationBoard stations={[fresh]} />);

      expect(screen.getByText("Not in the passport")).toBeInTheDocument();
      // It was registered at once by 9.7 and has never been heard from, so 9.2's
      // "within 120 seconds" test says offline, which is a real answer rather than unknown.
      expect(screen.getByText("Not responding")).toBeInTheDocument();
      // The reader has simply not reported yet, and that is not a fault.
      expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
      expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
    });
  });
});
