import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageTitle } from "@/components/layout/page-title";

describe("page title", () => {
  it("is the page's h1, focusable for route changes, with the yellow underline hidden from screen readers", () => {
    const { container } = render(<PageTitle>My tokens</PageTitle>);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAccessibleName("My tokens");
    expect(heading).toHaveAttribute("tabindex", "-1");
    const underline = container.querySelector("[data-title-underline]");
    expect(underline).toHaveAttribute("aria-hidden", "true");
    expect(heading).not.toContainElement(underline as HTMLElement | null);
  });
});
