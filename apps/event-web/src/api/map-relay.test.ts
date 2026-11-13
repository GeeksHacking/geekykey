import { afterEach, expect, it, vi } from "vitest";

import { NetworkError } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";
import { parseMapRelayResponse } from "@/api/schemas";

const game = {
  started_at: "2026-11-17T06:00:00.000Z",
  transfers: 2,
  transfers_needed: 4,
  calling_station_id: "s1",
  waiting_station_id: "s2",
  waiting_until: "2026-11-17T06:01:12.000Z",
  ended_at: null,
  complete: false,
};

afterEach(() => vi.unstubAllGlobals());

it("parses the relay's running game without adding names", () => {
  const response = { relay: { stations: ["s1", "s2"], game } };
  expect(parseMapRelayResponse(response)).toEqual(response);
});

it("accepts absent relay, no game, missed calls and ended games", () => {
  for (const response of [
    { relay: null },
    { relay: { stations: ["s1"], game: null } },
    {
      relay: {
        stations: ["s1", "s2"],
        game: { ...game, calling_station_id: null, waiting_station_id: null, waiting_until: null },
      },
    },
    {
      relay: {
        stations: ["s1", "s2"],
        game: { ...game, transfers: 4, ended_at: "2026-11-17T06:02:00.000Z", complete: true },
      },
    },
  ])
    expect(parseMapRelayResponse(response)).toEqual(response);
});

it.each([
  { transfers: -1 },
  { transfers: 1.5 },
  { transfers_needed: 2 },
  { waiting_until: "tomorrow" },
  { started_at: null },
  { complete: "yes" },
])("rejects malformed game fields: %j", (patch) => {
  expect(() =>
    parseMapRelayResponse({ relay: { stations: ["s1", "s2"], game: { ...game, ...patch } } }),
  ).toThrow(NetworkError);
});

it("reads the separate relay endpoint with the map's credentials and validation", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ relay: null })));
  vi.stubGlobal("fetch", fetch);
  await expect(createHttpClient().mapRelay()).resolves.toEqual({ relay: null });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/map/relay",
    expect.objectContaining({ credentials: "include" }),
  );
  fetch.mockResolvedValue(new Response(JSON.stringify({ relay: {} })));
  await expect(createHttpClient().mapRelay()).rejects.toThrow(NetworkError);
});

it("strips fields beyond the relay contract, including names and groups", () => {
  expect(
    parseMapRelayResponse({
      relay: { stations: ["s1", "s2"], group: "secret", game: { ...game, display_name: "secret" } },
    }),
  ).toEqual({ relay: { stations: ["s1", "s2"], game } });
});

it.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
  [429, "rate_limited"],
])("preserves relay errors %s %s", async (status, code) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: code }), { status })),
  );
  await expect(createHttpClient().mapRelay()).rejects.toMatchObject({ status, code });
});
