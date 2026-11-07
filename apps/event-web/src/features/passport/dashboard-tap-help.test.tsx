import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardTapHelp } from "@/features/passport/dashboard-tap-help";

function renderHelp(answersGame: boolean) {
  return render(<DashboardTapHelp answersGame={answersGame} />);
}

describe("DashboardTapHelp", () => {
  it("says how to connect when the event has the answers game", () => {
    renderHelp(true);

    expect(
      screen.getByRole("heading", {
        name: "Tap someone's token with your phone to connect.",
      }),
    ).toBeInTheDocument();
  });

  it("says how to start collecting stamps without the answers game", () => {
    renderHelp(false);

    expect(
      screen.getByRole("heading", {
        name: "Tap your token at any station to start collecting stamps",
      }),
    ).toBeInTheDocument();
  });

  it.each([true, false])(
    "doesn't tell a reader who has claimed a token to claim it (answers game: %s)",
    (answersGame) => {
      renderHelp(answersGame);

      expect(screen.queryByText(/claim/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "My tokens" })).not.toBeInTheDocument();
    },
  );

  it.each([true, false])(
    "no longer owns the user ID or its copy button (answers game: %s)",
    (answersGame) => {
      renderHelp(answersGame);

      expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
      // Matched on "Your user ID", which is what UserIdRow renders. Asserting the old
      // "Portal user ID" would pass forever now the wording is gone from the app.
      expect(screen.queryByText(/Your user ID/)).not.toBeInTheDocument();
    },
  );
});
