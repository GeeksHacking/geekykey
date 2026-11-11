import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { mockDuelRound } from "@/api/mock/duel-round";
import { TeamRoundCard } from "@/features/passport/team-round-card";
import { piecesEarned, wornPieces } from "@/features/passport/avatar/pieces";
import { mePollInterval } from "@/lib/me-poll-interval";
import { RoundPollingContext } from "@/lib/round-polling";
import { createTestProviders } from "@/test/providers";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

it("counts down, then says teams are being made until the poll lands", () => {
  vi.useFakeTimers();
  const round = mockDuelRound("opening", Date.now());
  render(<TeamRoundCard userId="a" round={round} />);
  expect(screen.getByText("Teams in 30s")).toBeVisible();
  act(() => {
    vi.advanceTimersByTime(31_000);
  });
  expect(screen.getByText("Making the teams…")).toBeVisible();
  expect(screen.getByText("4 players joined")).toBeVisible();
});

it.each([
  ["win", "Your team won!"],
  ["loss", "Your team lost."],
  ["tie", "Both teams won!"],
  ["nobody", "Nobody else joined."],
] as const)("shows %s and remembers dismissal only for that round", (scenario, title) => {
  const round = mockDuelRound(scenario, Date.now());
  const view = render(<TeamRoundCard userId="a" round={round} />);
  expect(screen.getByText(title)).toBeVisible();
  if (scenario !== "nobody")
    expect(
      screen.getByText(
        "Tap your phone on Jo's token to send a connection request. When they accept, the usual connection rules apply.",
      ),
    ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByLabelText("Team duels")).toBeNull();
  view.unmount();
  const again = render(<TeamRoundCard userId="a" round={round} />);
  expect(screen.queryByLabelText("Team duels")).toBeNull();
  again.rerender(<TeamRoundCard userId="a" round={{ ...round, id: "new" }} />);
  expect(screen.getByText(title)).toBeVisible();
});

it("says nobody won when no duel was won on either team", () => {
  const round = mockDuelRound("loss", Date.now());
  const noWins = { outcome: "loss" as const, your_team_wins: 0, their_team_wins: 0 };
  render(<TeamRoundCard userId="a" round={{ ...round, result: noWins }} />);
  expect(screen.getByText("Nobody won this round.")).toBeVisible();
  expect(screen.queryByText("Your team lost.")).toBeNull();
});

it("absent and null rounds add no markup", () => {
  const view = render(<TeamRoundCard userId="a" />);
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(<TeamRoundCard userId="a" round={null} />);
  expect(view.container).toBeEmptyDOMElement();
});

it("labels two playable tests by opponent and sends the play through the duel endpoint", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: "odd" });
  api.mock.setSession("dev-user-1");
  const spy = vi.spyOn(api, "playDuelReaction");
  const connection = vi.spyOn(api, "playReaction");
  const { Providers } = createTestProviders(api);
  render(<TeamRoundCard userId="a" round={mockDuelRound("odd", Date.now())} />, {
    wrapper: Providers,
  });
  expect(screen.getAllByRole("button", { name: "I'm ready" })).toHaveLength(2);
  fireEvent.click(
    within(screen.getByLabelText("Duel with Jo")).getByRole("button", { name: "I'm ready" }),
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: "Wait for green…" }));
  await vi.waitFor(() =>
    expect(spy).toHaveBeenCalledWith("20000000-0000-4000-8000-000000000000", { early: true }),
  );
  expect(connection).not.toHaveBeenCalled();
});

it("budgets faster polling only for live rounds and awards one piece per round win", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  api.mock.setSession("dev-user-1");
  const me = await api.me();
  expect(mePollInterval(null)).toBe(false);
  expect(mePollInterval({ ...me, round: undefined })).toBe(10_000);
  for (const state of ["opening", "playing", "ended"] as const) {
    expect(
      mePollInterval({ ...me, round: { ...mockDuelRound("win", Date.now()), state } }, true),
    ).toBe(state === "ended" ? 10_000 : 3_000);
  }
  expect(mePollInterval({ ...me, round: mockDuelRound("playing", Date.now()) }, false)).toBe(
    10_000,
  );
  expect(piecesEarned([])).toBe(0);
  expect(piecesEarned([], 3)).toBe(3);
  expect(wornPieces([], 9)).toBe(4);
});

it.each(["mixed", "team-win"] as const)(
  "separates the duel and round reward for %s",
  (scenario) => {
    render(<TeamRoundCard userId="a" round={mockDuelRound(scenario, Date.now())} />);
    expect(screen.getByText("Your duel")).toBeVisible();
    expect(screen.getByText(scenario === "mixed" ? "You win!" : "They win!")).toBeVisible();
    expect(screen.queryByText("Your team's win earned an avatar piece.") !== null).toBe(
      scenario === "team-win",
    );
  },
);

it("registers fast polling only for the lifetime of the card", () => {
  const setRoundCardMounted = vi.fn();
  const view = render(
    <RoundPollingContext value={setRoundCardMounted}>
      <TeamRoundCard userId="a" round={mockDuelRound("opening", Date.now())} />
    </RoundPollingContext>,
  );
  expect(setRoundCardMounted).toHaveBeenLastCalledWith(true);
  view.unmount();
  expect(setRoundCardMounted).toHaveBeenLastCalledWith(false);
});
it("shows the actual duel deadline and updates it while waiting", () => {
  vi.useFakeTimers();
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  const { Providers } = createTestProviders(api);
  const round = mockDuelRound("playing", Date.now());
  const view = render(<TeamRoundCard userId="a" round={round} />, { wrapper: Providers });
  expect(screen.getByText("120s left to play")).toBeVisible();
  act(() => vi.advanceTimersByTime(45000));
  expect(screen.getByText("75s left to play")).toBeVisible();
  const duel = round.duels[0]!;
  view.rerender(
    <TeamRoundCard
      userId="a"
      round={{
        ...round,
        duels: [{ ...duel, reaction: { ...duel.reaction!, your_play: "played", your_ms: 250 } }],
      }}
    />,
  );
  expect(screen.getByText("75s left to play")).toBeVisible();
  expect(screen.getByText("Waiting for them to play.")).toBeVisible();
});
