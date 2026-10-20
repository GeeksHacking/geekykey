import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminTap } from "@/api/types";
import { ScanLogTable } from "@/features/taps/scan-log-table";

const baseTap: AdminTap = {
  id: 1,
  client_tap_id: "tap-000001",
  station: { id: "s1", name: "3D Printing Booth" },
  user: { id: "u_1", display_name: "Alex Tan" },
  status: "accepted",
  source: "nfc",
  tapped_at: null,
  received_at: "2026-10-01T00:00:00.000Z",
};

describe("ScanLogTable", () => {
  it("shows the station, the participant name and the user ID", () => {
    render(<ScanLogTable taps={[baseTap]} />);

    const cells = within(screen.getAllByRole("row")[1]!);
    expect(cells.getByText("3D Printing Booth")).toBeInTheDocument();
    expect(cells.getByText("Alex Tan")).toBeInTheDocument();
    expect(cells.getByText("u_1")).toBeInTheDocument();
  });

  it("names a station without passport settings in plain text", () => {
    render(<ScanLogTable taps={[{ ...baseTap, station: { id: "s2", name: null } }]} />);

    const cells = within(screen.getAllByRole("row")[1]!);
    expect(cells.getByText("Not in the passport")).toBeInTheDocument();
  });

  it("names someone who has never logged in and still shows their user ID", () => {
    render(<ScanLogTable taps={[{ ...baseTap, user: { id: "u_9d4f", display_name: null } }]} />);

    const cells = within(screen.getAllByRole("row")[1]!);
    expect(cells.getByText("Never logged in")).toBeInTheDocument();
    expect(cells.getByText("u_9d4f")).toBeInTheDocument();
  });

  it("does not render a token column", () => {
    render(<ScanLogTable taps={[baseTap]} />);

    expect(screen.queryByRole("columnheader", { name: "Token" })).not.toBeInTheDocument();
  });
});
