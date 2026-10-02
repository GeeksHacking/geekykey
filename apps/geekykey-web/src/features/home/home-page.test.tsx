import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "@/features/home/home-page";

describe("HomePage", () => {
  it("renders the GeekyKey web placeholder", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Tokens and stations" })).toBeInTheDocument();
    expect(screen.getByText(/My tokens/)).toBeInTheDocument();
  });
});
