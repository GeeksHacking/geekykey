import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionTitle } from "@/components/layout/section-title";

describe("section title", () => {
  it("is an h2 named by its title alone, with the yellow marker hidden from screen readers", () => {
    const { container } = render(<SectionTitle id="on-the-list">On the list</SectionTitle>);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAccessibleName("On the list");
    expect(heading).toHaveAttribute("id", "on-the-list");
    expect(container.querySelector("[data-section-marker]")).toHaveAttribute("aria-hidden", "true");
  });
});
