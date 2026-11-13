import type { MockStation } from "@/api/mock/fixtures";
import type { MapRelayResponse } from "@/api/types";

/** Extra demo devices leave the seeded passport stations and their tests intact. */
export function relayDemoStations(now: number): MockStation[] {
  return ["A3", "C4"].map((booth, index) => ({
    id: `demo-relay-${index + 1}`,
    label: `Relay ${index + 1}`,
    game: "relay",
    booth,
    passport: null,
    created_at: new Date(now + index).toISOString(),
    disabled_at: null,
    last_seen_at: new Date(now).toISOString(),
    firmware_version: "0.9.0",
    buffered_taps: 0,
    reader_ok: true,
    simulate_online: false,
  }));
}

/** A completed game, then a timed-out game, repeated from the first relay read. */
export function mockMapRelay(
  stations: readonly MockStation[],
  started: number,
  now: number,
): MapRelayResponse {
  const ids = stations
    .filter((station) => station.game === "relay" && !station.disabled_at)
    .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
    .map((station) => station.id);
  if (ids.length === 0) return { relay: null };
  const repeat = started + Math.floor((now - started) / 210_000) * 210_000;
  const incomplete = now - repeat >= 70_000;
  const cycle = repeat + (incomplete ? 70_000 : 0);
  const elapsed = now - cycle;
  const steps = incomplete
    ? [
        { at: 3, transfers: 0, caller: 0 },
        { at: 9, transfers: 1, caller: 1 },
        { at: 29, transfers: 1, caller: null },
      ]
    : [
        { at: 3, transfers: 0, caller: 0 },
        { at: 9, transfers: 1, caller: 1 },
        { at: 15, transfers: 2, caller: 0 },
        { at: 35, transfers: 2, caller: null },
        { at: 39, transfers: 2, caller: 0 },
        { at: 45, transfers: 3, caller: 1 },
        { at: 51, transfers: 4, caller: null },
      ];
  const step = steps.findLast((step) => elapsed >= step.at * 1000);
  if (ids.length !== 2 || !step) return { relay: { stations: ids, game: null } };
  const complete = step.transfers === 4;
  const iso = (seconds: number) => new Date(cycle + seconds * 1000).toISOString();
  return {
    relay: {
      stations: ids,
      game: {
        started_at: iso(3),
        transfers: step.transfers,
        transfers_needed: 4,
        calling_station_id: step.caller === null ? null : (ids[step.caller] ?? null),
        waiting_station_id: step.caller === null ? null : (ids[1 - step.caller] ?? null),
        waiting_until: step.caller === null ? null : iso(step.at + 20),
        ended_at: complete ? iso(51) : incomplete && elapsed >= 129_000 ? iso(129) : null,
        complete,
      },
    },
  };
}
