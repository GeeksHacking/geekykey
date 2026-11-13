import { expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { parseMapRelayResponse } from "@/api/schemas";

it("answers relay to the same roles as map, with nothing when no stations run relay", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  await expect(api.mapRelay()).rejects.toMatchObject({ code: "unauthenticated" });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  await expect(api.mapRelay()).rejects.toMatchObject({ code: "forbidden" });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  await expect(api.mapRelay()).resolves.toEqual({ relay: null });
});

it("demonstrates calls, completed transfers, a missed call, the result and the next game by elapsed time", async () => {
  const start = Date.parse("2026-11-17T06:00:00.000Z");
  let now = start;
  const api = createMockClient({
    storage: null,
    latencyMs: [0, 0],
    relayDemo: true,
    now: () => now,
  });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const stations = (await api.map()).stations.filter((station) => station.game === "relay");
  expect(stations).toHaveLength(2);
  expect(stations.map((station) => station.booth)).toEqual(["A3", "C4"]);
  expect((await api.mapRelay()).relay?.game).toBeNull();
  for (const [seconds, transfers, waitingIndex] of [
    [3, 0, 1],
    [9, 1, 0],
    [15, 2, 1],
    [35, 2, -1],
    [39, 2, 1],
    [45, 3, 0],
    [51, 4, -1],
  ]) {
    now = start + seconds! * 1000;
    const response = await api.mapRelay();
    expect(parseMapRelayResponse(response)).toEqual(response);
    expect(response.relay?.game).toMatchObject({
      transfers,
      transfers_needed: 4,
      waiting_station_id: waitingIndex === -1 ? null : stations[waitingIndex!]?.station_id,
      complete: seconds === 51,
    });
  }
  now = start + 73_000;
  expect((await api.mapRelay()).relay?.game).toMatchObject({
    transfers: 0,
    started_at: "2026-11-17T06:01:13.000Z",
  });
  const first = stations[0]!;
  api.mock.data.stations.find((station) => station.id === first.station_id)!.disabled_at = new Date(
    now,
  ).toISOString();
  expect((await api.mapRelay()).relay?.game).toBeNull();
});

it("also demonstrates an incomplete game after two minutes without a tap", async () => {
  let now = Date.parse("2026-11-17T06:00:00.000Z");
  const start = now;
  const api = createMockClient({
    storage: null,
    latencyMs: [0, 0],
    relayDemo: true,
    now: () => now,
  });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  await api.mapRelay();
  now = start + 99_000;
  expect((await api.mapRelay()).relay?.game).toMatchObject({
    transfers: 1,
    waiting_until: null,
    ended_at: null,
  });
  now = start + 199_000;
  expect((await api.mapRelay()).relay?.game).toMatchObject({
    transfers: 1,
    complete: false,
    ended_at: "2026-11-17T06:03:19.000Z",
  });
  now = start + 213_000;
  expect((await api.mapRelay()).relay?.game).toMatchObject({
    transfers: 0,
    started_at: "2026-11-17T06:03:33.000Z",
  });
});
