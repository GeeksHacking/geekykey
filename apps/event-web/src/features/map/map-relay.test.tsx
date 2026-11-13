import { act, render, screen, waitFor } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, expect, it, vi } from "vitest";

import type { MapRelayResponse } from "@/api/types";
import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { MPH_EXAMPLE_PLAN } from "@/features/map/floor-plan";
import { MapRelay } from "@/features/map/map-relay";
import { placeStations } from "@/features/map/place-stations";
import { mapStation } from "@/features/map/test-stations";
import { relayPoll } from "@/features/map/test-relay";
import { createTestProviders } from "@/test/providers";

const stations = [
  mapStation({ station_id: "s1", game: "relay", booth: "B1", name: null }),
  mapStation({ station_id: "s2", game: "relay", booth: "B2", name: null }),
];

function setup(initial = stations, first: MapRelayResponse | Error = relayPoll()) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  const request = vi.spyOn(api, "mapRelay").mockResolvedValue(relayPoll());
  if (first instanceof Error) request.mockRejectedValue(first);
  else request.mockResolvedValue(first);
  const { Providers, queryClient } = createTestProviders(api);
  function View({ items = initial }: { items?: typeof stations }) {
    return (
      <Providers>
        <MapRelay stations={items} placed={placeStations(items, MPH_EXAMPLE_PLAN).placed}>
          {({ layer, status }) => (
            <>
              <svg>{layer}</svg>
              {status}
            </>
          )}
        </MapRelay>
      </Providers>
    );
  }
  const rendered = render(<View />);
  return {
    request,
    queryClient,
    rerender: (items: typeof stations) => rendered.rerender(<View items={items} />),
    poll: () =>
      act(async () => {
        await queryClient.refetchQueries({ queryKey: queryKeys.mapRelay });
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("makes no relay request when no station runs relay", async () => {
  const { request } = setup(stations.map((station) => ({ ...station, game: "passport" })));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Reactor Relay" })).not.toBeInTheDocument();
});

it("shows the relay line, marked waiting booth and a live count without names or groups", async () => {
  setup();
  const panel = await screen.findByRole("region", { name: "Reactor Relay" });
  expect(panel).toHaveTextContent("2 of 4");
  expect(panel).toHaveTextContent("Waiting at B2");
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  expect(document.querySelector("[data-relay-line]")).toHaveAttribute("x1", "254");
  expect(document.querySelector("[data-relay-waiting]")).toHaveAttribute(
    "transform",
    "translate(254 197)",
  );
  expect(panel).not.toHaveTextContent(/group|Alex|Priya/i);
});

it("polls relay after a second and moves the mark and count without a map request", async () => {
  const { request, rerender } = setup();
  await screen.findByText("2 of 4");
  request.mockResolvedValue(
    relayPoll({ transfers: 3, calling_station_id: "s2", waiting_station_id: "s1" }),
  );
  await waitFor(() => expect(screen.getByText("3 of 4")).toBeInTheDocument(), { timeout: 1600 });
  expect(screen.getByText("Waiting at B1")).toBeInTheDocument();
  rerender(stations.map((station) => ({ ...station, game: null })));
  expect(screen.queryByRole("region", { name: "Reactor Relay" })).not.toBeInTheDocument();
  const calls = request.mock.calls.length;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
  expect(request).toHaveBeenCalledTimes(calls);
});

it.each([
  new Error("offline"),
  new ApiError(403, "forbidden"),
  new ApiError(503, "service_unavailable"),
])("quietly removes a previously drawn relay on %s", async (error) => {
  const { request, poll } = setup();
  await screen.findByText("2 of 4");
  request.mockRejectedValue(error);
  await poll();
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Reactor Relay" })).not.toBeInTheDocument(),
  );
  expect(document.querySelector("[data-relay]")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  if (error instanceof ApiError && error.code === "forbidden") {
    const calls = request.mock.calls.length;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(request).toHaveBeenCalledTimes(calls);
  }
});

it("retains the last relay on rate_limited without an error notice, then recovers", async () => {
  const { request, poll } = setup();
  await screen.findByText("2 of 4");
  request.mockRejectedValue(new ApiError(429, "rate_limited"));
  await poll();
  expect(screen.getByText("2 of 4")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  request.mockResolvedValue(relayPoll({ transfers: 3 }));
  await poll();
  expect(await screen.findByText("3 of 4")).toBeInTheDocument();
});

it.each([
  new Error("offline"),
  new ApiError(429, "rate_limited"),
  { relay: null },
  { relay: { stations: ["s1", "s2"], game: null } },
])("shows nothing extra for an initial failure or absent game: %j", async (first) => {
  const { request } = setup(stations, first);
  await waitFor(() => expect(request).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.queryByRole("region", { name: "Reactor Relay" })).not.toBeInTheDocument();
  expect(document.querySelector("[data-relay]")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps a finished result for five seconds even when the following polls are rate limited", async () => {
  const { request, poll } = setup();
  await screen.findByText("2 of 4");
  request.mockResolvedValue(
    relayPoll({
      transfers: 4,
      ended_at: new Date(Date.now() - 4700).toISOString(),
      complete: true,
      calling_station_id: null,
      waiting_station_id: null,
      waiting_until: null,
    }),
  );
  await poll();
  expect(await screen.findByText("Relay complete")).toBeInTheDocument();
  expect(document.querySelector("[data-relay-waiting]")).not.toBeInTheDocument();
  request.mockRejectedValue(new ApiError(429, "rate_limited"));
  await poll();
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Reactor Relay" })).not.toBeInTheDocument(),
  );
});

it.each(["transfer", "loss", "end"])("animates a %s only on the changed poll", async (event) => {
  const { request, poll } = setup();
  await screen.findByText("2 of 4");
  const fromTo = vi.spyOn(gsap, "fromTo");
  const patch =
    event === "transfer"
      ? { transfers: 3 }
      : event === "loss"
        ? { waiting_until: null, calling_station_id: null, waiting_station_id: null }
        : { ended_at: new Date().toISOString() };
  request.mockResolvedValue(relayPoll(patch));
  await poll();
  await waitFor(() => expect(fromTo).toHaveBeenCalled());
  const target = document.querySelector(`[data-relay-${event === "end" ? "line" : event}]`);
  expect(fromTo.mock.calls.some(([element]) => element === target)).toBe(true);
  fromTo.mockClear();
  await poll();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(fromTo).not.toHaveBeenCalled();
});

it("updates the count and mark with reduced motion, playing no animation", async () => {
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
  const { request, poll } = setup();
  await screen.findByText("2 of 4");
  const fromTo = vi.spyOn(gsap, "fromTo");
  request.mockResolvedValue(
    relayPoll({ transfers: 3, calling_station_id: "s2", waiting_station_id: "s1" }),
  );
  await poll();
  expect(await screen.findByText("3 of 4")).toBeInTheDocument();
  expect(screen.getByText("Waiting at B1")).toBeInTheDocument();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(fromTo).not.toHaveBeenCalled();
});

it("says a transfer was missed even when the next poll already contains a replacement call", async () => {
  const { request, poll } = setup();
  await screen.findByText("2 of 4");
  request.mockResolvedValue(relayPoll({ waiting_until: "2026-11-17T06:00:40.000Z" }));
  await poll();
  expect(await screen.findByText("Missed. Now waiting at B2")).toBeInTheDocument();
});

it("after a missed call, says which station calls again", async () => {
  const { request, poll } = setup();
  await screen.findByText("Waiting at B2");
  request.mockResolvedValue(
    relayPoll({ calling_station_id: null, waiting_station_id: null, waiting_until: null }),
  );
  await poll();
  expect(await screen.findByText("Missed. Tap again at B1")).toBeInTheDocument();
  expect(document.querySelector("[data-relay-waiting]")).not.toBeInTheDocument();
});

it("after a missed call it didn't see, still says to tap again", async () => {
  setup(
    stations,
    relayPoll({ calling_station_id: null, waiting_station_id: null, waiting_until: null }),
  );
  expect(await screen.findByText("Missed. Tap again")).toBeInTheDocument();
});
