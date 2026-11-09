import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/layout/page-header";

describe("page header", () => {
  it("keeps the title as the page's h1, with the yellow underline hidden from screen readers", () => {
    const { container } = render(<PageHeader title="Stations" description="Every station." />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAccessibleName("Stations");
    const underline = container.querySelector("[data-title-underline]");
    expect(underline).toHaveAttribute("aria-hidden", "true");
    expect(heading).not.toContainElement(underline as HTMLElement | null);
  });
});
