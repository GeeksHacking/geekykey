import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ParticipantTapRow } from "@/components/participant-tap-row";

describe("ParticipantTapRow", () => {
  it("names a station without passport settings in plain text", () => {
    render(
      <ul>
        <ParticipantTapRow
          tap={{
            id: 1,
            station_id: "station-1",
            station_name: null,
            status: "no_game",
            source: "nfc",
            tapped_at: null,
            received_at: "2026-10-01T00:00:00.000Z",
          }}
        />
      </ul>,
    );

    expect(screen.getByText("Other station")).toBeInTheDocument();
    expect(screen.getByText("Not in this game")).toBeInTheDocument();
  });
});
