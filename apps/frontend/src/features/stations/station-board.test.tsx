import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EventStationBoardStation } from "@/api/types";
import { StationBoard } from "@/features/stations/station-board";

const stations: EventStationBoardStation[] = [
  {
    id: "linked-reader",
    label: "Reader 3",
    linked: true,
    passport: null,
    last_seen_at: "2026-10-10T09:00:00.000Z",
    online: true,
    firmware_version: "0.3.1",
    buffered_taps: 0,
    reader_ok: false,
    last_tap_at: null,
  },
  {
    id: "unlinked-passport",
    label: "Reader 5",
    linked: false,
    passport: {
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      added_at: "2026-10-01T00:00:00.000Z",
    },
    last_seen_at: "2026-10-10T09:00:00.000Z",
    online: false,
    firmware_version: "0.3.0",
    buffered_taps: 3,
    reader_ok: true,
    last_tap_at: "2026-10-10T08:58:00.000Z",
  },
];

describe("StationBoard", () => {
  it("shows passport, not-in-passport, unlinked, and last-tap states", () => {
    render(<StationBoard stations={stations} />);

    expect(screen.getByText("Reader 3")).toBeInTheDocument();
    expect(screen.getByText("Not in the passport")).toBeInTheDocument();
    expect(screen.getByText("Careers Corner")).toBeInTheDocument();
    expect(screen.getByText("No longer linked")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });
});
