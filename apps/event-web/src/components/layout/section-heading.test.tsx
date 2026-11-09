import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeading } from "@/components/layout/section-heading";

describe("section heading", () => {
  it("is an h2 named by its title alone, with the yellow marker hidden from screen readers", () => {
    const { container } = render(<SectionHeading id="latest" title="Latest stamps" />);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAccessibleName("Latest stamps");
    expect(heading).toHaveAttribute("id", "latest");
    expect(container.querySelector("[data-section-marker]")).toHaveAttribute("aria-hidden", "true");
  });
});
