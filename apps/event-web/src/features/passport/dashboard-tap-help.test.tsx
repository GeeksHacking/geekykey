import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardTapHelp } from "@/features/passport/dashboard-tap-help";

describe("DashboardTapHelp", () => {
  it("says how to start collecting stamps", () => {
    render(<DashboardTapHelp />);

    expect(
      screen.getByRole("heading", {
        name: "Tap your token at any station to start collecting stamps",
      }),
    ).toBeInTheDocument();
  });

  it("doesn't tell a reader who has claimed a token to claim it", () => {
    render(<DashboardTapHelp />);

    expect(screen.queryByText(/with your phone to claim it/)).not.toBeInTheDocument();
    expect(screen.getByText(/No token yet\?/)).toBeInTheDocument();
  });

  it("still reaches My tokens for someone without a token", () => {
    render(<DashboardTapHelp />);

    expect(screen.getByRole("link", { name: "My tokens" })).toHaveAttribute(
      "href",
      "http://localhost:5174/",
    );
  });

  it("no longer owns the user ID or its copy button", () => {
    render(<DashboardTapHelp />);

    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    // Matched on "Your user ID", which is what UserIdRow renders. Asserting the old
    // "Portal user ID" would pass forever now the wording is gone from the app.
    expect(screen.queryByText(/Your user ID/)).not.toBeInTheDocument();
  });
});
