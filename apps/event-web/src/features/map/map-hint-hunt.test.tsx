import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import type { MapHintHuntResponse } from "@/api/types";
import { MapHintHunt } from "@/features/map/map-hint-hunt";
import { BOOTH_PLAN } from "@/features/map/floor-plan";
import { placeStations } from "@/features/map/place-stations";
import { hintHuntPoll } from "@/features/map/test-hint-hunt";
import { mapStation } from "@/features/map/test-stations";
import { createTestProviders } from "@/test/providers";

const at = Date.parse("2026-11-17T06:00:43.000Z");
const stations = [
  mapStation({
    station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
    game: "hint_hunt",
    booth: " booth 1 ",
    name: null,
  }),
];

function setup(initial = stations, first: MapHintHuntResponse | Error = hintHuntPoll()) {
  vi.spyOn(Date, "now").mockReturnValue(at);
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  const request = vi.spyOn(api, "mapHintHunt");
  if (first instanceof Error) request.mockRejectedValue(first);
  else request.mockResolvedValue(first);
  const { Providers, queryClient } = createTestProviders(api);
  function View({ items = initial }: { items?: typeof stations }) {
    return (
      <Providers>
        <MapHintHunt stations={items} placed={placeStations(items, BOOTH_PLAN).placed} />
      </Providers>
    );
  }
  const rendered = render(<View />);
  return {
    request,
    rerender: (items: typeof stations) => rendered.rerender(<View items={items} />),
    poll: () =>
      act(async () => {
        await queryClient.refetchQueries({ queryKey: queryKeys.mapHintHunt });
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("shows full hints oldest first at the canonical booth, with tries and a polite status", async () => {
  setup();
  const panel = await screen.findByRole("region", { name: "Hint hunt Booth 1" });
  expect(panel).toHaveTextContent("Whoever matches every hint taps the station.");
  const hints = within(panel).getAllByRole("listitem");
  expect(hints[0]).toHaveTextContent("Where do you get your best ideas?In the shower");
  expect(hints[1]).toHaveTextContent("Coffee or tea?Tea");
  expect(panel).toHaveTextContent("2 tries left");
  expect(panel).toHaveTextContent("Next hint in 7s");
  const status = within(panel).getByRole("status");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(status).not.toHaveTextContent("Next hint");
  expect(panel).not.toHaveTextContent(/Q3B|Q1B|Alex|Priya|avatar/);
});

it.each([
  ["won", "Found! Someone matched every hint."],
  ["lost_tries", "Not found. No tries left."],
  ["lost_time", "Not found. Time ran out."],
  ["too_few", "Not enough players. A round needs 3 from 2 groups."],
  ["no_target", "No round. Nobody who tapped in has made a connection yet."],
] as const)("shows %s and keeps the hints beneath the result", async (ended_how, message) => {
  setup(
    stations,
    hintHuntPoll({ ended_how, ended_at: new Date(at).toISOString(), next_hint_at: null }),
  );
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByText(/^\d+ tr(?:y|ies) left$|Next hint/)).not.toBeInTheDocument();
});

it.each([{ hint_hunt: null }, { hint_hunt: { rounds: [] } }])(
  "shows idle for no round: %j",
  async (response) => {
    setup(stations, response);
    expect(await screen.findByText("Tap the station to start a round.")).toBeInTheDocument();
    expect(screen.getByText("A round needs 3 players from 2 groups.")).toBeInTheDocument();
  },
);

it("shows the player count and tapping-in countdown", async () => {
  setup(
    stations,
    hintHuntPoll({
      started_at: null,
      hints: [],
      next_hint_at: null,
      joining_until: new Date(at + 12_000).toISOString(),
    }),
  );
  expect(await screen.findByText("12s left to tap in")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/^5 in/);
  expect(screen.getByText("12s left to tap in")).toBeInTheDocument();
  expect(screen.getByText("A round needs 3 players from 2 groups.")).toBeInTheDocument();
  expect(screen.getByRole("status")).not.toHaveTextContent("12s");
});

it("ticks the next-hint countdown locally, clamped at zero, without changing live text", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const { request, poll } = setup();
  await screen.findByText("Next hint in 7s");
  request.mockRejectedValue(new ApiError(429, "rate_limited"));
  await poll();
  const status = screen.getByRole("status");
  const text = status.textContent;
  vi.mocked(Date.now).mockReturnValue(at + 1000);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByText("Next hint in 6s")).toBeInTheDocument();
  expect(status.textContent).toBe(text);
  vi.mocked(Date.now).mockReturnValue(at + 20_000);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByText("Next hint in 0s")).toBeInTheDocument();
});

it("ticks tapping in and last-hint countdowns and uses the singular try", async () => {
  const { request, poll } = setup(
    stations,
    hintHuntPoll({
      started_at: null,
      hints: [],
      next_hint_at: null,
      joining_until: new Date(at + 1000).toISOString(),
    }),
  );
  await screen.findByText("1s left to tap in");
  // Wait for the next real local tick with a fixed clock advanced beyond the deadline.
  vi.mocked(Date.now).mockReturnValue(at + 2000);
  await screen.findByText("0s left to tap in", {}, { timeout: 1600 });
  request.mockResolvedValue(
    hintHuntPoll({ tries_left: 1, next_hint_at: null, ends_at: new Date(at + 5000).toISOString() }),
  );
  await poll();
  expect(await screen.findByText("1 try left")).toBeInTheDocument();
  expect(screen.getByText("Last hint. 3s left to find them.")).toBeInTheDocument();
  vi.mocked(Date.now).mockReturnValue(at + 9000);
  expect(
    await screen.findByText("Last hint. 0s left to find them.", {}, { timeout: 1600 }),
  ).toBeInTheDocument();
});

it("returns to idle 60 seconds after an ending even when polls keep stale data", async () => {
  const { request, poll } = setup(
    stations,
    hintHuntPoll({
      ended_how: "won",
      ended_at: new Date(at - 59_000).toISOString(),
      next_hint_at: null,
    }),
  );
  await screen.findByText("Found! Someone matched every hint.");
  request.mockRejectedValue(new ApiError(429, "rate_limited"));
  await poll();
  vi.mocked(Date.now).mockReturnValue(at + 1000);
  expect(
    await screen.findByText("Tap the station to start a round.", {}, { timeout: 1600 }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("polls every second, updates hints and stops when the game is removed", async () => {
  const { request, rerender } = setup();
  await screen.findByText("2 tries left");
  request.mockResolvedValue(
    hintHuntPoll({
      tries_left: 1,
      hints: [{ question: "Coffee or tea?", choice: "Tea", short: "Q1B" }],
    }),
  );
  expect(await screen.findByText("1 try left", {}, { timeout: 1600 })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  rerender(stations.map((station) => ({ ...station, game: null })));
  expect(screen.queryByRole("heading", { name: "Hint hunt" })).not.toBeInTheDocument();
  const calls = request.mock.calls.length;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
  expect(request).toHaveBeenCalledTimes(calls);
});

it("makes no request without a hint hunt station", async () => {
  const { request } = setup(stations.map((station) => ({ ...station, game: "passport" })));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "Hint hunt" })).not.toBeInTheDocument();
});

it("doesn't poll when the only hint hunt station is disabled", async () => {
  const { request } = setup(stations.map((station) => ({ ...station, disabled: true })));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(request).not.toHaveBeenCalled();
});

it("shows a card for each enabled station, naming an unplaced one's booth by its text", async () => {
  setup([
    ...stations,
    mapStation({ station_id: "s2", game: "hint_hunt", booth: null }),
    mapStation({ station_id: "s4", game: "hint_hunt", booth: "Hall C" }),
    mapStation({ station_id: "s3", game: "hint_hunt", disabled: true }),
  ]);
  await screen.findByText("2 tries left");
  expect(screen.getAllByRole("heading", { name: "Hint hunt" })).toHaveLength(3);
  expect(screen.getByRole("region", { name: "Hint hunt Hall C" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Hint hunt No booth" })).toHaveTextContent(
    "Tap the station to start a round.",
  );
});

it.each([
  new Error("offline"),
  new ApiError(403, "forbidden"),
  new ApiError(503, "service_unavailable"),
])("hides failed data without an error message: %s", async (error) => {
  const { request, poll } = setup();
  await screen.findByText("2 tries left");
  request.mockRejectedValue(error);
  await poll();
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Hint hunt" })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  if (error instanceof ApiError && error.code === "forbidden") {
    const calls = request.mock.calls.length;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(request).toHaveBeenCalledTimes(calls);
  }
});

it("recovers after rate limiting while keeping the last hints", async () => {
  const { request, poll } = setup();
  await screen.findByText("2 tries left");
  request.mockRejectedValue(new ApiError(429, "rate_limited"));
  await poll();
  expect(screen.getByText("In the shower")).toBeInTheDocument();
  request.mockResolvedValue(hintHuntPoll({ tries_left: 1 }));
  await poll();
  expect(await screen.findByText("1 try left")).toBeInTheDocument();
});

it("does not mistake loading or an initial failure for an idle round", async () => {
  const { request } = setup(stations, new Error("offline"));
  expect(screen.queryByText("Tap the station to start a round.")).not.toBeInTheDocument();
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(screen.queryByRole("heading", { name: "Hint hunt" })).not.toBeInTheDocument();
});
