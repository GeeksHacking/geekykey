import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardClaimHelp } from "@/features/passport/dashboard-claim-help";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
});

describe("DashboardClaimHelp", () => {
  it("shows the claim instructions, Portal ID, and external token link", () => {
    render(<DashboardClaimHelp userId="portal-user-1" />);

    expect(screen.getByText("Tap your token with your phone to claim it")).toBeInTheDocument();
    expect(screen.getByText("portal-user-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tokens" })).toHaveAttribute(
      "href",
      "http://localhost:5174/",
    );
  });

  it("copies the Portal user ID", async () => {
    render(<DashboardClaimHelp userId="portal-user-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("portal-user-1");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
