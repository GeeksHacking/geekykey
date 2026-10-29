import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { MapScreen } from "@/features/map/map-screen";
import { createTestProviders } from "@/test/providers";

/** Station 1 in the fixtures, the 3D Printing Booth at B1. */
const PRINTING_ID = "ca939e19-8216-4b95-8375-5b54e543c5f6";

function setup(
  userId: string = SEEDED_ORGANIZER_ID,
  prepare: (api: MockApiClient) => void = () => {},
) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(userId);
  prepare(api);
  const { Providers, queryClient } = createTestProviders(api, { session: true });
  const router = createRouter({
    routeTree: createRootRoute({ component: MapScreen }),
    history: createMemoryHistory({ initialEntries: ["/map"] }),
  });
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  const poll = () =>
    act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.map });
    });
  return { api, poll };
}

function ringOf(stationId: string) {
  return document.querySelector(`[data-pulse="${stationId}"]`);
}

/** A QR fallback tap at the 3D Printing Booth, which raises its `taps` on the next poll. */
async function tapAtPrinting(api: MockApiClient) {
  await api.createFallbackTap({ station_id: PRINTING_ID, user_id: "u_7f3a" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MapScreen", () => {
  it("lists each station at its booth, by name, with how many people tapped there", async () => {
    setup();

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    const printing = onMap.getByText("3D Printing Booth").closest("li");
    expect(printing).toHaveTextContent("B1");
    expect(onMap.getByText("Mentor Lounge").closest("li")).toHaveTextContent("A2");
    expect(ringOf(PRINTING_ID)).toBeInTheDocument();
  });

  it("marks a disabled station in words, not by colour alone", async () => {
    setup();

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    expect(onMap.getByText("Info Desk").closest("li")).toHaveTextContent("Disabled");
  });

  it("lists a station with no booth, or one the plan doesn't name, beside the map", async () => {
    setup();

    const offMap = within(await screen.findByRole("region", { name: "Not on the map" }));
    expect(offMap.getByText("Careers Corner").closest("li")).toHaveTextContent("D2");
    expect(offMap.getByText("None").closest("li")).toHaveTextContent("Unnamed station");
  });

  it("shows no participant's name", async () => {
    const { api } = setup();

    await screen.findByRole("region", { name: "On the map" });
    for (const user of api.mock.data.users) {
      if (user.display_name) expect(document.body).not.toHaveTextContent(user.display_name);
    }
  });

  it("pulses a station when its taps go up between two polls, and nothing otherwise", async () => {
    const { api, poll } = setup();
    await screen.findByRole("region", { name: "On the map" });
    const fromTo = vi.spyOn(gsap, "fromTo");

    await poll();
    // Query tells React about a poll on a later tick, so give a render the chance to land.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(fromTo).not.toHaveBeenCalled();

    await tapAtPrinting(api);
    await poll();
    await waitFor(() => expect(fromTo).toHaveBeenCalledTimes(1));
    expect(fromTo.mock.calls[0]?.[0]).toBe(ringOf(PRINTING_ID));
    expect(fromTo.mock.calls[0]?.[2]).toMatchObject({ attr: { r: 49.5 } });
  });

  it("keeps the ring still when reduced motion is asked for", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { api, poll } = setup();
    await screen.findByRole("region", { name: "On the map" });
    const fromTo = vi.spyOn(gsap, "fromTo");

    await tapAtPrinting(api);
    await poll();
    await waitFor(() => expect(fromTo).toHaveBeenCalled());
    expect(fromTo.mock.calls[0]?.[2]).toMatchObject({ attr: { r: 18 } });
  });

  it("keeps the map and shows a quiet note when a poll is rate limited", async () => {
    const { api, poll } = setup();
    await screen.findByRole("region", { name: "On the map" });

    api.mock.failNext("rate_limited");
    await poll();

    expect(await screen.findByText("Showing the last update.")).toBeInTheDocument();
    expect(screen.getByText("3D Printing Booth")).toBeInTheDocument();
  });

  it("says when the map can't load at all", async () => {
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockRejectedValue(new Error("offline"));
    });

    expect(await screen.findByText("Couldn't load the map")).toBeInTheDocument();
  });

  it("tells an account that isn't a map screen or an organiser that it can't show the map", async () => {
    setup(SEEDED_PARTICIPANT_ID);

    expect(
      await screen.findByRole("heading", { name: "This account can't show the map" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});
