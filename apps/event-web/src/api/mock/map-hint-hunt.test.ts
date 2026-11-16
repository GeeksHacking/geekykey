import { expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { parseMapHintHuntResponse } from "@/api/schemas";

it("answers only the map's roles and derives its stations from the board", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  await expect(api.mapHintHunt()).rejects.toMatchObject({ code: "unauthenticated" });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  await expect(api.mapHintHunt()).rejects.toMatchObject({ code: "forbidden" });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const stations = (await api.map()).stations.filter(
    (station) => station.game === "hint_hunt" && !station.disabled,
  );
  const response = await api.mapHintHunt();
  expect(response.hint_hunt?.rounds.map((round) => round.station_id)).toEqual(
    stations.map((station) => station.station_id),
  );
  expect(parseMapHintHuntResponse(response)).toEqual(response);
  for (const station of api.mock.data.stations)
    if (station.game === "hint_hunt") station.disabled_at = new Date().toISOString();
  expect(await api.mapHintHunt()).toEqual({ hint_hunt: null });
});

it("repeats a timed demo with two initial hints, the last hint, a win and tapping in", async () => {
  const start = Date.parse("2026-11-17T06:00:00.000Z");
  let now = start;
  const api = createMockClient({ storage: null, latencyMs: [0, 0], now: () => now });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const first = await api.mapHintHunt();
  expect(first.hint_hunt?.rounds.length).toBeGreaterThan(0);
  expect(first.hint_hunt!.rounds[0]).toMatchObject({
    players: 5,
    tries_left: 2,
    ended_at: null,
    next_hint_at: new Date(start + 7000).toISOString(),
  });
  expect(first.hint_hunt!.rounds[0]!.hints).toHaveLength(2);
  expect(await api.mapHintHunt()).toEqual(first);
  for (const hint of first.hint_hunt!.rounds[0]!.hints) {
    const question = api.mock.data.questions!.find((question) => question.text === hint.question)!;
    expect(question.choices.map((choice) => choice.text)).toContain(hint.choice);
  }
  now = start + 17_000;
  const last = await api.mapHintHunt();
  expect(last.hint_hunt!.rounds[0]).toMatchObject({
    next_hint_at: null,
    ends_at: new Date(start + 27_000).toISOString(),
  });
  expect(last.hint_hunt!.rounds[0]!.hints).toHaveLength(4);
  now = start + 22_000;
  expect((await api.mapHintHunt()).hint_hunt!.rounds[0]).toMatchObject({
    ended_how: "won",
    ended_at: new Date(now).toISOString(),
    next_hint_at: null,
  });
  now = start + 82_000;
  const joining = await api.mapHintHunt();
  expect(joining.hint_hunt!.rounds[0]).toMatchObject({
    players: 1,
    started_at: null,
    hints: [],
    next_hint_at: null,
    ends_at: null,
    ended_at: null,
    ended_how: null,
  });
  expect(parseMapHintHuntResponse(joining)).toEqual(joining);
});

it("orders enabled stations oldest first, ignoring stations that changed game", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const enabled = api.mock.data.stations.filter((station) => station.game === "hint_hunt");
  const other = api.mock.data.stations.find((station) => station.game !== "hint_hunt")!;
  other.game = "hint_hunt";
  expect((await api.mapHintHunt()).hint_hunt!.rounds.map((round) => round.station_id)).toEqual(
    [...enabled, other]
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((station) => station.id),
  );
  for (const station of api.mock.data.stations)
    if (station.game === "hint_hunt") station.game = null;
  expect(await api.mapHintHunt()).toEqual({ hint_hunt: null });
});
