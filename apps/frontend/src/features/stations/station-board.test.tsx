import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EventStationBoardStation } from "@/api/types";
import { StationBoard } from "@/features/stations/station-board";

function station(overrides: Partial<EventStationBoardStation> = {}): EventStationBoardStation {
  return {
    id: "station-1",
    label: "Reader 1",
    linked: true,
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

/** Two faults at once: a dead reader and taps it has not sent yet. */
const unlinkedPassport = station({
  id: "unlinked-passport",
  label: "Reader 5",
  linked: false,
  online: false,
  buffered_taps: 3,
  reader_ok: true,
  last_tap_at: null,
});

/** Two faults: its reader is not answering, and it has no passport settings. */
const deadReader = station({
  id: "dead-reader",
  label: "Reader 3",
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
  it("shows passport, not-in-passport, unlinked, and last-tap states", () => {
    render(<StationBoard stations={[unlinkedPassport, deadReader]} />);

    expect(screen.getByText("Careers Corner")).toBeInTheDocument();
    expect(screen.getByText("No longer linked")).toBeInTheDocument();
    expect(screen.getByText("Reader 3")).toBeInTheDocument();
    expect(screen.getByText("Not in the passport")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("names every problem on a station that has several", () => {
    render(<StationBoard stations={[unlinkedPassport]} />);

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

    expect(names[0]).toContain("Reader 3");
    expect(names[1]).toContain("Healthy Booth");
    expect(names[2]).toContain("Quiet Booth");
  });
});
