import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TapStatusLabel } from "@/components/tap-status";

describe("TapStatusLabel", () => {
  it("always carries a text label, never colour alone", () => {
    render(
      <>
        <TapStatusLabel status="accepted" />
        <TapStatusLabel status="cooldown" />
        <TapStatusLabel status="no_game" />
      </>,
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
    expect(screen.getByText("No game")).toBeInTheDocument();
  });
});
