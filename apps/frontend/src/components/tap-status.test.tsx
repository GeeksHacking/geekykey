import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TapStatusLabel } from "@/components/tap-status";

describe("TapStatusLabel", () => {
  it("always carries a text label, never colour alone", () => {
    render(
      <>
        <TapStatusLabel status="accepted" />
        <TapStatusLabel status="cooldown" />
        <TapStatusLabel status="unknown_token" />
      </>,
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
    expect(screen.getByText("Unknown token")).toBeInTheDocument();
  });

  it("uses plain-language wording for participants", () => {
    render(<TapStatusLabel status="cooldown" audience="participant" />);
    expect(screen.getByText("Too soon")).toBeInTheDocument();
  });
});
