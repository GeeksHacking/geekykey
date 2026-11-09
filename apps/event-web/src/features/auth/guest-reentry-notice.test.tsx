import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GuestReentryNotice } from "@/features/auth/guest-reentry-notice";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

describe("GuestReentryNotice", () => {
  it("says the way back for a guest, in the agreement's words", () => {
    const { container } = render(<GuestReentryNotice />);

    expect(container.querySelector("p")).toHaveTextContent(
      "Signed in as a guest? Open GeekyKey and tap your event button.",
    );
  });

  it("links Open GeekyKey to the GeekyKey screens", () => {
    render(<GuestReentryNotice />);

    expect(screen.getByRole("link", { name: "Open GeekyKey" })).toHaveAttribute(
      "href",
      GEEKYKEY_SCREENS_URL,
    );
  });
});
