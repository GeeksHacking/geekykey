import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteSwitch } from "@/components/layout/site-switch";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

describe("SiteSwitch", () => {
  it("marks the event screens as the current site, not as a link", () => {
    render(<SiteSwitch />);

    expect(screen.getByText("Event")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Event" })).not.toBeInTheDocument();
  });

  it("opens the key screens in the same tab", () => {
    render(<SiteSwitch />);

    const key = screen.getByRole("link", { name: "Key" });
    expect(key).toHaveAttribute("href", GEEKYKEY_SCREENS_URL);
    expect(key).not.toHaveAttribute("target");
  });

  it("names the group for a screen reader", () => {
    render(<SiteSwitch />);

    expect(screen.getByRole("navigation", { name: "Sites" })).toBeInTheDocument();
  });
});
