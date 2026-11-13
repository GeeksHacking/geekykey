import type { MapRelayResponse } from "@/api/types";
import type { PlacedStation } from "@/features/map/place-stations";

export type RelayEvent = "transferred" | "lost" | "ended";
export interface RelayView {
  endpoints: [PlacedStation, PlacedStation];
  waiting: PlacedStation | undefined;
  /**
   * Where the transfer completed since the last poll arrived, when that's known: the station now
   * calling the next group, or after the last transfer the one the previous poll had waiting.
   */
  arrivedAt: PlacedStation | undefined;
  progress: string;
  state: "running" | "complete" | "incomplete";
  events: RelayEvent[];
}

/** A finished result stays readable for five seconds, then the ordinary map returns. */
export const RELAY_RESULT_MS = 5_000;

/** The drawable state and changes between polls. First sight of a game never animates. */
export function deriveRelay(
  previous: MapRelayResponse | undefined,
  current: MapRelayResponse | undefined,
  placed: readonly PlacedStation[],
  now: number,
): RelayView | null {
  const relay = current?.relay;
  const game = relay?.game;
  if (!relay || !game || relay.stations.length !== 2) return null;
  if (placed.filter((item) => item.station.game === "relay" && !item.station.disabled).length !== 2)
    return null;
  const [first, second] = relay.stations.map((id) =>
    placed.find(
      (item) =>
        item.station.station_id === id && item.station.game === "relay" && !item.station.disabled,
    ),
  );
  if (!first || !second || first === second) return null;
  if (game.ended_at && now >= Date.parse(game.ended_at) + RELAY_RESULT_MS) return null;
  const before = previous?.relay?.game;
  const events: RelayEvent[] = [];
  if (before?.started_at === game.started_at) {
    if (!before.ended_at && game.ended_at) events.push("ended");
    if (game.transfers > before.transfers) events.push("transferred");
    else if (
      before.waiting_until &&
      (before.waiting_until !== game.waiting_until ||
        before.calling_station_id !== game.calling_station_id ||
        before.waiting_station_id !== game.waiting_station_id)
    )
      events.push("lost");
  }
  const arrivedId = events.includes("transferred")
    ? (game.calling_station_id ?? before?.waiting_station_id)
    : undefined;
  return {
    endpoints: [first, second],
    arrivedAt: [first, second].find((item) => item.station.station_id === arrivedId),
    waiting: game.ended_at
      ? undefined
      : [first, second].find((item) => item.station.station_id === game.waiting_station_id),
    progress: `${game.transfers} of ${game.transfers_needed}`,
    state: game.ended_at ? (game.complete ? "complete" : "incomplete") : "running",
    events,
  };
}
