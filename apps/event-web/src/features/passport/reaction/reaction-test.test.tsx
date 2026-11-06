import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, type MockConnection } from "@/api/mock/fixtures";
import type { Reaction } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));
vi.mock("@/features/passport/avatar/voxel-stage", () => ({ VoxelStage: () => null }));

/*
  The reaction test in the reveal (BAC-156, for the agreement's next version, 8.11 and section 13).
  The dashboard runs on the mock client, whose other person plays when a test says so.
*/

const READY = "I'm ready";
const WAIT = "Wait for green…";

function SignedIn({ children }: { children: ReactNode }) {
  return useSession().status === "authenticated" ? children : <p>Loading</p>;
}

/** A reaction connection made `secondsAgo`, with what each person has played so far. */
function reactionConnection(
  secondsAgo: number,
  kept: Partial<Reaction> = {},
  theirMs?: number | null,
): MockConnection {
  const connectedAt = Date.now() - secondsAgo * 1000;
  return {
    id: "c_reaction",
    connected_at: new Date(connectedAt).toISOString(),
    display_name: "Mei Lin",
    bio: null,
    contact_line: null,
    kind: "B",
    match: 60,
    dice: null,
    reaction: {
      play_by: new Date(connectedAt + 120_000).toISOString(),
      your_play: "not_played",
      your_ms: null,
      their_play: "not_played",
      their_ms: null,
      result: null,
      ...kept,
    },
    ...(theirMs !== undefined && { their_ms: theirMs }),
    shared: [],
    shared_at: new Date(connectedAt + 120_000).toISOString(),
  };
}

function setUp(connection: MockConnection) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID)!;
  guest.connections = [connection];
  return api;
}

function keptReaction(api: MockApiClient) {
  return api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID)!.connections![0]!.reaction;
}

async function renderDashboard(api: MockApiClient) {
  const { Providers } = createTestProviders(api, { session: true });
  render(
    <Providers>
      <ThemeProvider>
        <SignedIn>
          <DashboardScreen />
        </SignedIn>
      </ThemeProvider>
    </Providers>,
  );
  return screen.findByRole("status", { name: "New connection" });
}

/**
 * Presses I'm ready and lets the random wait run out, on fake timers so the time from green to
 * the tap is exact. The wait is the shortest, 1.5 seconds.
 */
async function getReady(reveal: HTMLElement) {
  const ready = await within(reveal).findByRole("button", { name: READY });
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  fireEvent.click(ready);
  const box = within(reveal).getByRole("button", { name: WAIT });
  act(() => vi.advanceTimersByTime(1_499));
  expect(box).toHaveTextContent(WAIT);
  return box;
}

/** Taps, lets the play reach the mock, then goes back to real timers. */
async function tap(box: HTMLElement) {
  fireEvent.pointerDown(box);
  await act(() => vi.advanceTimersByTimeAsync(50));
  vi.useRealTimers();
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the reaction test in the reveal (BAC-156)", () => {
  it("says how to play before anything starts, and starts nothing until I'm ready", async () => {
    const reveal = await renderDashboard(setUp(reactionConnection(10)));
    expect(within(reveal).getByText("Reaction test")).toBeInTheDocument();
    expect(
      within(reveal).getByText(
        "When the box turns green, tap it as fast as you can. Tap before then and you lose. The faster of you wins.",
      ),
    ).toBeInTheDocument();
    expect(within(reveal).getByText("You have 2 minutes to play.")).toBeInTheDocument();
    expect(within(reveal).queryByRole("button", { name: WAIT })).not.toBeInTheDocument();
    expect(within(reveal).queryByText(/rolled/)).not.toBeInTheDocument();

    const box = await getReady(reveal);
    act(() => vi.advanceTimersByTime(1));
    expect(box).toHaveTextContent("Tap!");
  });

  it("sends the time from green to the tap, then says it and waits for them", async () => {
    const api = setUp(reactionConnection(10));
    const reveal = await renderDashboard(api);
    const box = await getReady(reveal);
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(312));
    await tap(box);

    expect(await within(reveal).findByText("You took 312 ms.")).toBeInTheDocument();
    expect(within(reveal).getByText("Waiting for them to play.")).toBeInTheDocument();
    expect(keptReaction(api)).toMatchObject({ your_play: "played", your_ms: 312 });
    const list = screen.getByRole("list", { name: "Connections" });
    expect(within(list).getByText("You took 312 ms.")).toBeInTheDocument();
    expect(within(list).getByText("Waiting for them to play.")).toBeInTheDocument();
  });

  it("sends a tap before green as too soon", async () => {
    const api = setUp(reactionConnection(10));
    const reveal = await renderDashboard(api);
    await tap(await getReady(reveal));

    expect(
      await within(reveal).findByText("Too soon! You tapped before green."),
    ).toBeInTheDocument();
    expect(keptReaction(api)).toMatchObject({ your_play: "early", your_ms: null });
  });

  it("shows the result as soon as the play brings it, when they've played already", async () => {
    const api = setUp(reactionConnection(10, {}, 287));
    const reveal = await renderDashboard(api);
    const box = await getReady(reveal);
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(240));
    await tap(box);

    expect(await within(reveal).findByText("You took 240 ms. They took 287 ms.")).toBeVisible();
    expect(within(reveal).getByText("You win!")).toBeInTheDocument();
  });

  it("says a send failed, and sends the same play again", async () => {
    const api = setUp(reactionConnection(10));
    const reveal = await renderDashboard(api);
    const box = await getReady(reveal);
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(405));
    api.mock.failNext("network");
    await tap(box);

    expect(
      await within(reveal).findByText("Couldn't send your result. Try again."),
    ).toBeInTheDocument();
    expect(keptReaction(api)?.your_play).toBe("not_played");
    await userEvent.setup().click(within(reveal).getByRole("button", { name: "Send again" }));
    expect(await within(reveal).findByText("Waiting for them to play.")).toBeInTheDocument();
    expect(keptReaction(api)).toMatchObject({ your_play: "played", your_ms: 405 });
  });
});

describe("the reaction test in the list (BAC-156)", () => {
  it("offers a test the reveal no longer shows, once, and not twice beside the reveal", async () => {
    const api = setUp(reactionConnection(10));
    const reveal = await renderDashboard(api);
    const list = screen.getByRole("list", { name: "Connections" });
    expect(within(list).queryByRole("button", { name: READY })).not.toBeInTheDocument();
    expect(within(list).getByText("Reaction test in progress.")).toBeInTheDocument();

    await userEvent.setup().click(within(reveal).getByRole("button", { name: "Dismiss" }));
    const box = await getReady(list);
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(198));
    await tap(box);

    expect(await within(list).findByText("You took 198 ms.")).toBeInTheDocument();
    expect(keptReaction(api)).toMatchObject({ your_play: "played", your_ms: 198 });
  });
});

describe("the reaction test's result, in the reveal and the list (BAC-156)", () => {
  it.each([
    [{ your_play: "played", your_ms: 240 }, 287, "You took 240 ms. They took 287 ms.", "You win!"],
    [{ your_play: "played", your_ms: 301 }, 287, "You took 301 ms. They took 287 ms.", "They win!"],
    [
      { your_play: "played", your_ms: 287 },
      287,
      "You took 287 ms. They took 287 ms.",
      "You both win!",
    ],
    [{ your_play: "early" }, 287, "You tapped too soon. They took 287 ms.", "They win!"],
    [
      { your_play: "played", your_ms: 350 },
      null,
      "You took 350 ms. They tapped too soon.",
      "You win!",
    ],
    [{ your_play: "early" }, null, "You tapped too soon. They tapped too soon.", "Nobody wins."],
  ] as const)("shows %j against %j", async (kept, theirMs, times, result) => {
    const reveal = await renderDashboard(setUp(reactionConnection(30, kept, theirMs)));
    const list = screen.getByRole("list", { name: "Connections" });
    for (const section of [reveal, list]) {
      expect(within(section).getByText(times)).toBeInTheDocument();
      expect(within(section).getByText(result)).toBeInTheDocument();
    }
  });

  it("says who didn't play in time once the 2 minutes are up", async () => {
    const reveal = await renderDashboard(setUp(reactionConnection(121, {}, 287)));
    expect(within(reveal).getByText("You didn't play in time. They took 287 ms.")).toBeVisible();
    expect(within(reveal).getByText("They win!")).toBeInTheDocument();
    expect(within(reveal).queryByRole("button", { name: READY })).not.toBeInTheDocument();
  });
});
