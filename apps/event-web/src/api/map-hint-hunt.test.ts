import { afterEach, expect, it, vi } from "vitest";

import { NetworkError } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";
import { parseMapHintHuntResponse } from "@/api/schemas";
import { hintHuntPoll } from "@/features/map/test-hint-hunt";

afterEach(() => vi.unstubAllGlobals());

it("accepts agreement 9.22's example exactly", () => {
  const response = hintHuntPoll();
  expect(parseMapHintHuntResponse(response)).toEqual(response);
});

it("accepts no game, no round, tapping in and every ending", () => {
  for (const response of [
    { hint_hunt: null },
    { hint_hunt: { rounds: [] } },
    hintHuntPoll({ started_at: null, hints: [], next_hint_at: null }),
    ...(["won", "lost_tries", "lost_time", "too_few", "no_target"] as const).map((ended_how) =>
      hintHuntPoll({ ended_how, ended_at: "2026-11-17T06:01:00.000Z", next_hint_at: null }),
    ),
  ])
    expect(parseMapHintHuntResponse(response)).toEqual(response);
});

it.each([
  { players: -1 },
  { players: 1.5 },
  { tries_left: 4 },
  { tries_left: -1 },
  { joining_until: "tomorrow" },
  { opened_at: null },
  { hints: [{ short: "Q1B" }] },
  { next_hint_at: "later" },
  { ended_how: "lost" },
])("rejects malformed round fields: %j", (patch) => {
  const round = hintHuntPoll().hint_hunt!.rounds[0]!;
  expect(() =>
    parseMapHintHuntResponse({ hint_hunt: { rounds: [{ ...round, ...patch }] } }),
  ).toThrow(NetworkError);
});

it("strips extra identity fields from the round and its hints", () => {
  const response = hintHuntPoll();
  const round = response.hint_hunt!.rounds[0]!;
  expect(
    parseMapHintHuntResponse({
      hint_hunt: {
        rounds: [
          {
            ...round,
            user_id: "secret",
            display_name: "secret",
            group: "secret",
            avatar: {},
            hints: round.hints.map((hint) => ({ ...hint, target: "secret" })),
          },
        ],
      },
    }),
  ).toEqual(response);
});

it("reads and validates the separate endpoint with session credentials", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(hintHuntPoll())));
  vi.stubGlobal("fetch", fetch);
  await expect(createHttpClient().mapHintHunt()).resolves.toEqual(hintHuntPoll());
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/map/hint-hunt",
    expect.objectContaining({ credentials: "include" }),
  );
  fetch.mockResolvedValue(new Response(JSON.stringify({ hint_hunt: {} })));
  await expect(createHttpClient().mapHintHunt()).rejects.toThrow(NetworkError);
});

it.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
  [429, "rate_limited"],
] as const)("preserves endpoint errors %s %s", async (status, code) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: code }), { status })),
  );
  await expect(createHttpClient().mapHintHunt()).rejects.toMatchObject({ status, code });
});
