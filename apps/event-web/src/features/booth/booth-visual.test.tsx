import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BoothVisual } from "@/features/booth/booth-visual";

describe("BoothVisual", () => {
  it("says what stays and what changes each event", () => {
    render(<BoothVisual />);

    expect(
      screen.getByRole("heading", { name: "What stays and what changes each event" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We are not increasing tech debt; we are abstracting the parts that were always going to be rebuilt anyway.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stays" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changes with each event" })).toBeInTheDocument();

    for (const heading of [
      "The token and who owns it",
      "The GeekyKey Service",
      "The station hardware",
      "How a station reads a token",
      "The event's rules",
      "What each game records",
      "The screens",
      "The games",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("calls the passport a second game in one event", () => {
    render(<BoothVisual />);

    expect(
      screen.getByRole("heading", { name: "The passport is a second game" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The same token and the same station hardware run it. Both games run in one event, so it isn't a second event.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The dice, the 3D roll and the reaction test changed no file in the firmware, the GeekyKey Service or the token screens.",
      ),
    ).toBeInTheDocument();
  });

  it("gives the honest costs", () => {
    render(<BoothVisual />);

    expect(screen.getByRole("heading", { name: "The honest costs" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Each token's chip holds a fixed address, so key.geekshacking.com/t/ has to keep working as long as tokens are in use.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Stations are the real hardware upkeep. The buck converter arrived over a month late, which shows the risk.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only one event has run so far, so the yearly saving is a design goal, not a result yet.",
      ),
    ).toBeInTheDocument();
  });

  it("renders without the app's providers, because it reads no data", () => {
    render(<BoothVisual />);

    expect(
      screen.getByRole("heading", { name: "What stays and what changes each event" }),
    ).toBeInTheDocument();
  });

  it("does not name the scrapped event or an A/B analysis", () => {
    render(<BoothVisual />);

    expect(screen.queryByText(/grad tea/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/A\/B/)).not.toBeInTheDocument();
  });
});
