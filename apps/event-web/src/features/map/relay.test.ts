import { expect, it } from "vitest";

import { relayPoll } from "@/features/map/test-relay";
import { MPH_EXAMPLE_PLAN } from "@/features/map/floor-plan";
import { placeStations } from "@/features/map/place-stations";
import { deriveRelay } from "@/features/map/relay";
import { mapStation } from "@/features/map/test-stations";

const now = Date.parse("2026-11-17T06:00:12.000Z");
const placed = placeStations(
  [
    mapStation({ station_id: "s1", game: "relay", booth: "B1" }),
    mapStation({ station_id: "s2", game: "relay", booth: "B2" }),
  ],
  MPH_EXAMPLE_PLAN,
).placed;

it("draws the two booths, waiting station and counts on the first poll without animation", () => {
  expect(deriveRelay(undefined, relayPoll(), placed, now)).toMatchObject({
    endpoints: [
      { x: 254, y: 106 },
      { x: 254, y: 197 },
    ],
    waiting: { station: { station_id: "s2" } },
    progress: "2 of 4",
    state: "running",
    events: [],
  });
});

it("animates completed transfers and moves the waiting mark", () => {
  const next = relayPoll({ transfers: 3, calling_station_id: "s2", waiting_station_id: "s1" });
  expect(deriveRelay(relayPoll(), next, placed, now)).toMatchObject({
    events: ["transferred"],
    waiting: { station: { station_id: "s1" } },
    arrivedAt: { station: { station_id: "s2" } },
    progress: "3 of 4",
  });
});

it("knows where a transfer arrived after a missed call, from the station now calling", () => {
  const missed = relayPoll({
    calling_station_id: null,
    waiting_station_id: null,
    waiting_until: null,
  });
  // s2 called again after the miss, and s1 completed it before the next poll.
  const next = relayPoll({ transfers: 3, calling_station_id: "s1", waiting_station_id: "s2" });
  expect(deriveRelay(missed, next, placed, now)?.arrivedAt?.station.station_id).toBe("s1");
});

it("knows where the last transfer arrived from the previous poll's waiting station", () => {
  const last = relayPoll({
    transfers: 4,
    calling_station_id: null,
    waiting_station_id: null,
    waiting_until: null,
    ended_at: new Date(now).toISOString(),
    complete: true,
  });
  expect(
    deriveRelay(relayPoll({ transfers: 3 }), last, placed, now)?.arrivedAt?.station.station_id,
  ).toBe("s2");
  const afterMiss = relayPoll({
    transfers: 3,
    calling_station_id: null,
    waiting_station_id: null,
    waiting_until: null,
  });
  expect(deriveRelay(afterMiss, last, placed, now)?.arrivedAt).toBeUndefined();
});

it.each([
  { calling_station_id: null, waiting_station_id: null, waiting_until: null },
  { waiting_until: "2026-11-17T06:00:40.000Z" },
  { calling_station_id: "s2", waiting_station_id: "s1" },
])("detects an uncompleted call closed or replaced: %j", (patch) => {
  expect(deriveRelay(relayPoll(), relayPoll(patch), placed, now)?.events).toEqual(["lost"]);
});

it.each([true, false])("marks the end of the same game, complete=%s", (complete) => {
  expect(
    deriveRelay(
      relayPoll(),
      relayPoll({ ended_at: new Date(now).toISOString(), complete }),
      placed,
      now,
    ),
  ).toMatchObject({ state: complete ? "complete" : "incomplete", events: ["ended"] });
});

it("does not animate unchanged polls, new games, resets or a first sight of an ended game", () => {
  const ended = relayPoll({ ended_at: new Date(now).toISOString(), complete: true });
  for (const [previous, current] of [
    [relayPoll(), relayPoll()],
    [
      relayPoll(),
      relayPoll({ started_at: "2026-11-17T06:00:11.000Z", transfers: 0, waiting_until: null }),
    ],
    [relayPoll(), relayPoll({ transfers: 1 })],
    [undefined, ended],
    [ended, ended],
  ])
    expect(deriveRelay(previous, current, placed, now)?.events).toEqual([]);
});

it("hides old results at five seconds and clears the waiting mark on an ended game", () => {
  const ended = relayPoll({ ended_at: new Date(now).toISOString() });
  expect(deriveRelay(undefined, ended, placed, now + 4999)?.waiting).toBeUndefined();
  expect(deriveRelay(undefined, ended, placed, now + 5000)).toBeNull();
});

it("draws nothing without a game or exactly two distinct enabled, placed relay stations", () => {
  for (const response of [
    undefined,
    { relay: null },
    { relay: { stations: ["s1", "s2"], game: null } },
    { relay: { ...relayPoll().relay!, stations: ["s1"] } },
    { relay: { ...relayPoll().relay!, stations: ["s1", "s1"] } },
    { relay: { ...relayPoll().relay!, stations: ["s1", "s2", "s3"] } },
  ])
    expect(deriveRelay(undefined, response, placed, now)).toBeNull();
  expect(deriveRelay(undefined, relayPoll(), placed.slice(0, 1), now)).toBeNull();
  for (const patch of [{ disabled: true }, { game: "passport" }]) {
    const changed = placed.map((item) => ({ ...item, station: { ...item.station, ...patch } }));
    expect(deriveRelay(undefined, relayPoll(), changed, now)).toBeNull();
  }
});

it("draws nothing when the map still has a third placed relay station", () => {
  expect(
    deriveRelay(
      undefined,
      relayPoll(),
      [
        ...placed,
        { ...placed[0]!, station: mapStation({ station_id: "s3", game: "relay", booth: "B3" }) },
      ],
      now,
    ),
  ).toBeNull();
});
