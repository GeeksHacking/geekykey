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
import { relayPoll } from "@/features/map/test-relay";
import { mapStation } from "@/features/map/test-stations";
import { createTestProviders } from "@/test/providers";

/** Station 1 in the fixtures, the 3D Printing Booth at Booth 1. */
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
  return {
    api,
    poll,
    pollRelay: () =>
      act(async () => {
        await queryClient.refetchQueries({ queryKey: queryKeys.mapRelay });
      }),
  };
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
  it("shows only the two booths on our table", async () => {
    setup();

    const plan = await screen.findByRole("img", { name: /GeekyKey booth/ });
    expect(screen.getByText("GeekyKey booth")).toBeInTheDocument();
    const labels = [...plan.querySelectorAll("text")].map((text) => text.textContent);
    expect(labels.filter((text) => !/^\d+$|Disabled|Open seat/.test(text ?? ""))).toEqual([
      "Booth 1",
      "Booth 2",
    ]);
    expect(plan.querySelector("pattern, path")).toBeNull();
    expect(document.body).not.toHaveTextContent(/guest|MPH|grad tea/i);
  });

  it("lists each station at its booth, by name, with how many people tapped there", async () => {
    setup();

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    const printing = onMap.getByText("3D Printing Booth").closest("li");
    expect(printing).toHaveTextContent("Booth 1");
    expect(onMap.getByText("Mentor Lounge").closest("li")).toHaveTextContent("Booth 2");
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
    expect(offMap.getByText("No booth").closest("li")).toHaveTextContent("No game yet");
  });

  it("names a station outside the passport by its game, and keeps a long booth in its row", async () => {
    const booth = "Registration desk by the east entrance";
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [
          mapStation({ station_id: "gatsby", game: "gatsby", name: null, booth: "Booth 1" }),
          mapStation({ station_id: "desk", game: null, name: null, booth }),
        ],
      });
    });

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    expect(onMap.getByText("gatsby")).toBeInTheDocument();
    const offMap = within(screen.getByRole("region", { name: "Not on the map" }));
    const line = offMap.getByText(`Booth ${booth} isn't on this plan`);
    expect(line).toHaveClass("truncate");
    expect(line).toHaveAttribute("title", booth);
  });

  it("names a station without a passport name by its game's name", async () => {
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [
          mapStation({ station_id: "passport", game: "passport", name: null, booth: "Booth 1" }),
          mapStation({ station_id: "duels", game: "team_duels", name: null, booth: "Booth 2" }),
          mapStation({ station_id: "relay", game: "relay", name: null, booth: "Booth 1" }),
          mapStation({ station_id: "seat", game: "open_seat", name: null, booth: "Booth 2" }),
        ],
      });
    });

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    expect(onMap.getByText("Passport")).toBeInTheDocument();
    expect(onMap.getByText("Team duels")).toBeInTheDocument();
    expect(onMap.getByText("Relay")).toBeInTheDocument();
    expect(onMap.getByText("Open seat")).toBeInTheDocument();
    expect(onMap.queryByText(/Runs /)).not.toBeInTheDocument();
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

  it("offers Log out when the account stops being allowed after the map has loaded", async () => {
    const { api, poll } = setup();
    await screen.findByRole("region", { name: "On the map" });

    api.mock.failNext("forbidden");
    await poll();

    expect(
      await screen.findByRole("heading", { name: "This account can't show the map" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("tells an account that isn't a map screen or an organiser that it can't show the map", async () => {
    setup(SEEDED_PARTICIPANT_ID);

    expect(
      await screen.findByRole("heading", { name: "This account can't show the map" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("shows the connection count and the anonymous web", async () => {
    setup();

    const panel = await screen.findByRole("region", { name: "Connections" });
    expect(panel).toHaveTextContent(/\d+ connections/);
    expect(within(panel).getByRole("img")).toHaveAccessibleName(
      /A web of \d+ connections between \d+ participants\. No names are shown\./,
    );
    expect(document.querySelector("[data-web-node='1']")).toBeInTheDocument();
  });

  it("keeps the web's layout as it grows over a poll", async () => {
    const { poll } = setup();
    const panel = await screen.findByRole("region", { name: "Connections" });
    const node = () => document.querySelector("[data-web-node='1']")?.getAttribute("transform");
    const edges = () => panel.querySelectorAll("[data-web-edge]").length;
    const before = node();
    const first = edges();

    await poll();
    await waitFor(() => expect(edges()).toBeGreaterThan(first));

    expect(node()).toBe(before);
  });

  it("says when there are no connections yet", async () => {
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [mapStation({ station_id: "s1", booth: "Booth 1" })],
        connections: { count: 0, links: [] },
      });
    });

    expect(
      await screen.findByText(
        "No connections yet. Participants connect by tapping each other's tokens.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-web-node]")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/guest|MPH|grad tea/i);
  });

  it("draws no web when connections is left out", async () => {
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [mapStation({ station_id: "s1", booth: "Booth 1" })],
      });
    });

    await screen.findByRole("region", { name: "On the map" });
    expect(screen.queryByRole("region", { name: "Connections" })).not.toBeInTheDocument();
  });

  it("marks an open seat on the plan and in the list", async () => {
    const until = new Date(Date.now() + 42_000).toISOString();
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [mapStation({ station_id: "s1", booth: "Booth 1", open_seat_until: until })],
      });
    });

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    expect(onMap.getByText(/Open seat \d+s/)).toBeInTheDocument();
    const mark = document.querySelector('[data-open-seat="open"]');
    expect(mark?.textContent).toMatch(/Open seat \d+s/);
  });

  it("shows Taken for one poll when the seat goes before its closing time", async () => {
    const open = {
      stations: [
        mapStation({
          station_id: "s1",
          booth: "Booth 1",
          open_seat_until: new Date(Date.now() + 60_000).toISOString(),
        }),
      ],
    };
    const gone = {
      stations: [mapStation({ station_id: "s1", booth: "Booth 1", open_seat_until: null })],
    };
    const { poll } = setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map")
        .mockResolvedValueOnce(open)
        .mockResolvedValueOnce(gone)
        .mockImplementation(async () => ({
          stations: [mapStation({ station_id: "s1", booth: "Booth 1", open_seat_until: null })],
        }));
    });

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    await poll();
    await waitFor(() => expect(onMap.getByText("Taken")).toBeInTheDocument());
    expect(document.querySelector('[data-open-seat="taken"]')).not.toBeNull();

    await poll();
    await waitFor(() => expect(onMap.queryByText("Taken")).not.toBeInTheDocument());
  });

  it("clears a seat that closed at its closing time without Taken", async () => {
    const closed = {
      stations: [
        mapStation({
          station_id: "s1",
          booth: "Booth 1",
          open_seat_until: new Date(Date.now() - 1_000).toISOString(),
        }),
      ],
    };
    const gone = {
      stations: [mapStation({ station_id: "s1", booth: "Booth 1", open_seat_until: null })],
    };
    const { poll } = setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValueOnce(closed).mockResolvedValue(gone);
    });

    const onMap = within(await screen.findByRole("region", { name: "On the map" }));
    expect(onMap.getAllByText("Open seat").length).toBeGreaterThan(0);
    await poll();
    await waitFor(() => expect(onMap.queryByText("Open seat")).not.toBeInTheDocument());
    expect(screen.queryByText("Taken")).not.toBeInTheDocument();
  });

  it("shows the open seat in the list for a station with no booth", async () => {
    const until = new Date(Date.now() + 42_000).toISOString();
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [mapStation({ station_id: "s1", booth: null, open_seat_until: until })],
      });
    });

    const offMap = within(await screen.findByRole("region", { name: "Not on the map" }));
    const row = offMap.getByText("3D Printing Booth").closest("li");
    if (!row) throw new Error("missing station row");
    expect(row).toHaveTextContent(/Open seat \d+s/);
  });

  it("adds no poll for the open seat", async () => {
    let calls = 0;
    setup(SEEDED_ORGANIZER_ID, (api) => {
      const map = api.map.bind(api);
      vi.spyOn(api, "map").mockImplementation(async () => {
        calls += 1;
        return map();
      });
    });

    await screen.findByRole("region", { name: "On the map" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 1_200)));
    expect(calls).toBe(1);
  });

  it("keeps the relay drawing and the open seat mark together", async () => {
    const until = new Date(Date.now() + 42_000).toISOString();
    setup(SEEDED_ORGANIZER_ID, (api) => {
      vi.spyOn(api, "map").mockResolvedValue({
        stations: [
          mapStation({ station_id: "s1", game: "relay", name: null, booth: "Booth 1" }),
          mapStation({ station_id: "s2", game: "relay", name: null, booth: "Booth 2" }),
          mapStation({
            station_id: "seat",
            game: "open_seat",
            name: "Open Seat Station",
            booth: "Booth 2",
            open_seat_until: until,
          }),
        ],
        connections: { count: 1, links: [[1, 2]] },
      });
      vi.spyOn(api, "mapRelay").mockResolvedValue(relayPoll());
    });

    await screen.findByRole("region", { name: "Reactor Relay" });
    const onMap = within(screen.getByRole("region", { name: "On the map" }));
    const row = onMap.getByText("Open Seat Station").closest("li");
    if (!row) throw new Error("missing station row");
    expect(row).toHaveTextContent(/Open seat \d+s/);
    const plan = screen.getByRole("img", { name: /GeekyKey booth/ });
    expect(plan.querySelector("[data-relay-line]")).not.toBeNull();
    expect(plan.querySelector('[data-open-seat="open"]')).not.toBeNull();
    const tapLabel = [...plan.querySelectorAll("text")].find(
      (text) => text.textContent === "Tap here",
    );
    expect(plan.querySelector("[data-relay-waiting]")).toContainElement(tapLabel ?? null);
    expect(tapLabel).toHaveAttribute("y", "-48");
  });
});

it("adds the relay to the plan and side column without replacing the connection web", async () => {
  const { api } = setup(SEEDED_ORGANIZER_ID, (api) => {
    vi.spyOn(api, "map").mockResolvedValue({
      stations: [
        mapStation({ station_id: "s1", game: "relay", booth: "Booth 1", name: null }),
        mapStation({ station_id: "s2", game: "relay", booth: "Booth 2", name: null }),
      ],
      connections: { count: 1, links: [[1, 2]] },
    });
    vi.spyOn(api, "mapRelay").mockResolvedValue(relayPoll());
  });
  const relay = await screen.findByRole("region", { name: "Reactor Relay" });
  expect(relay).toHaveTextContent("2 of 4");
  const web = screen.getByRole("region", { name: "Connections" });
  const plan = screen.getByRole("img", { name: /GeekyKey booth/ });
  expect(web).toHaveClass("lg:col-start-1", "lg:row-span-3");
  expect(plan).toHaveClass("lg:col-start-2", "lg:row-start-2");
  expect(relay.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("region", { name: "Connections" })).toHaveTextContent("1 connection");
  expect(
    screen.getByRole("img", { name: /GeekyKey booth/ }).querySelector("[data-relay-line]"),
  ).toBeInTheDocument();
  for (const user of api.mock.data.users)
    if (user.display_name) expect(document.body).not.toHaveTextContent(user.display_name);
  for (const group of api.mock.data.groups) expect(relay).not.toHaveTextContent(group.name);
});

it("does not ask for relay progress on the ordinary map", async () => {
  let relayRequest;
  setup(SEEDED_ORGANIZER_ID, (api) => {
    relayRequest = vi.spyOn(api, "mapRelay");
  });
  await screen.findByRole("region", { name: "Connections" });
  expect(relayRequest).not.toHaveBeenCalled();
});

it("keeps the map and web without an error notice when the relay request fails", async () => {
  const { api, pollRelay } = setup(SEEDED_ORGANIZER_ID, (api) => {
    vi.spyOn(api, "map").mockResolvedValue({
      stations: [
        mapStation({ station_id: "s1", game: "relay", booth: "Booth 1" }),
        mapStation({ station_id: "s2", game: "relay", booth: "Booth 2" }),
      ],
      connections: { count: 1, links: [[1, 2]] },
    });
    vi.spyOn(api, "mapRelay").mockResolvedValue(relayPoll());
  });
  await screen.findByRole("region", { name: "Reactor Relay" });
  vi.spyOn(api, "mapRelay").mockRejectedValue(new Error("offline"));
  await pollRelay();
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Reactor Relay" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("region", { name: "Connections" })).toHaveTextContent("1 connection");
  expect(screen.getByRole("img", { name: /GeekyKey booth/ })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
