import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import type { HintHuntRound, MapStation } from "@/api/types";
import { MapScreen } from "@/features/map/map-screen";
import { hintHuntPoll } from "@/features/map/test-hint-hunt";
import { mapStation } from "@/features/map/test-stations";
import { relayPoll } from "@/features/map/test-relay";
import { createTestProviders } from "@/test/providers";

const station = mapStation({
  station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  game: "hint_hunt",
  booth: "Booth 1",
});

function setup(patch: Partial<HintHuntRound> = {}, items: MapStation[] = [station], idle = false) {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-17T06:00:43.000Z"));
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  vi.spyOn(api, "map").mockResolvedValue({
    stations: items,
    connections: { count: 1, links: [[1, 2]] },
  });
  const hintRequest = vi
    .spyOn(api, "mapHintHunt")
    .mockResolvedValue(idle ? { hint_hunt: { rounds: [] } } : hintHuntPoll(patch));
  vi.spyOn(api, "mapRelay").mockResolvedValue(relayPoll());
  const { Providers } = createTestProviders(api, { session: true });
  const router = createRouter({
    routeTree: createRootRoute({ component: MapScreen }),
    history: createMemoryHistory({ initialEntries: ["/map"] }),
  });
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return hintRequest;
}

afterEach(() => vi.restoreAllMocks());

it("puts the running hints in a band above the map, leaving the relay status by the booth plan", async () => {
  setup({}, [
    station,
    mapStation({ station_id: "s1", game: "relay", booth: "Booth 1" }),
    mapStation({ station_id: "s2", game: "relay", booth: "Booth 2" }),
  ]);
  const hint = await screen.findByRole("region", { name: "Hint hunt Booth 1" });
  const relay = await screen.findByRole("region", { name: "Reactor Relay" });
  expect(relay.parentElement).toHaveClass("lg:col-start-2", "lg:row-start-1");
  // The band comes before the map's grid, so four hints never push the relay out of view.
  expect(hint.compareDocumentPosition(relay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(hint.parentElement?.contains(relay)).toBe(false);
  expect(within(hint).getByText("In the shower")).toBeInTheDocument();
  expect(within(hint).getByText("Next hint in 7s")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /GeekyKey booth, with 3 stations/ })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Connections" })).toBeInTheDocument();
});

it.each([
  ["won", "Found! Someone matched every hint."],
  ["lost_tries", "Not found. No tries left."],
  ["lost_time", "Not found. Time ran out."],
  ["too_few", "Not enough players. A round needs 3 from 2 groups."],
  ["no_target", "No round. Nobody who tapped in has answered the questions yet."],
] as const)("shows %s on the map", async (ended_how, message) => {
  setup({ ended_how, ended_at: "2026-11-17T06:00:40.000Z", next_hint_at: null });
  const panel = await screen.findByRole("region", { name: "Hint hunt Booth 1" });
  expect(panel).toHaveTextContent(message);
  expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
});

it("shows tapping in on the map", async () => {
  setup({
    started_at: null,
    hints: [],
    next_hint_at: null,
    joining_until: "2026-11-17T06:00:50.000Z",
  });
  expect(await screen.findByText("7s left to tap in")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Hint hunt Booth 1" })).toHaveTextContent("5 in");
});

it("shows an idle station on the map", async () => {
  setup({}, [station], true);
  expect(await screen.findByText("Tap the station to start a round.")).toBeInTheDocument();
});

it("has no card or poll when no station runs hint hunt", async () => {
  const request = setup({}, [{ ...station, game: "passport" }]);
  await screen.findByRole("img", { name: /GeekyKey booth, with 1 station/ });
  expect(screen.queryByRole("heading", { name: "Hint hunt" })).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
