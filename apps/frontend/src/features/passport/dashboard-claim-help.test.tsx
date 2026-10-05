import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardClaimHelp } from "@/features/passport/dashboard-claim-help";

describe("DashboardClaimHelp", () => {
  it("shows the claim instructions and the external token link", () => {
    render(<DashboardClaimHelp />);

    expect(screen.getByText("Tap your token with your phone to claim it")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tokens" })).toHaveAttribute(
      "href",
      "http://localhost:5174/",
    );
  });

  it("no longer owns the user ID or its copy button", () => {
    render(<DashboardClaimHelp />);

    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Portal user ID/)).not.toBeInTheDocument();
  });
});
