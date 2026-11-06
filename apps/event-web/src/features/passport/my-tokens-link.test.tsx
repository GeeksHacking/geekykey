import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MyTokensLink } from "@/features/passport/my-tokens-link";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

describe("MyTokensLink", () => {
  it("says where to see and release the user's tokens", () => {
    render(<MyTokensLink />);

    expect(screen.getByText(/See and release your tokens on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tokens" })).toHaveAttribute(
      "href",
      GEEKYKEY_SCREENS_URL,
    );
  });

  it("opens My tokens in a new tab without passing the event's address on", () => {
    render(<MyTokensLink />);

    const link = screen.getByRole("link", { name: "My tokens" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
