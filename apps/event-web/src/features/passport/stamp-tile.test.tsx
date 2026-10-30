import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StampTile } from "@/features/passport/stamp-tile";

const base = {
  station_id: "s1",
  name: "3D Printing Booth",
  location: "Hall A",
  points: 2,
  link: "https://example.com/3d-printing",
};

describe("StampTile", () => {
  it("marks an earned stamp with the word Stamped and its time", () => {
    render(
      <ul>
        <StampTile stamp={{ ...base, earned_at: "2026-10-10T01:00:00.000Z" }} />
      </ul>,
    );
    expect(screen.getByText(/Stamped/)).toBeInTheDocument();
    expect(screen.getByText("2 pts")).toBeInTheDocument();
    expect(screen.queryByText("Not stamped yet")).not.toBeInTheDocument();
  });

  it("shows an empty slot when earned_at is null", () => {
    render(
      <ul>
        <StampTile stamp={{ ...base, earned_at: null }} />
      </ul>,
    );
    expect(screen.getByText("Not stamped yet")).toBeInTheDocument();
    expect(screen.getByText("3D Printing Booth")).toBeInTheDocument();
  });
});
