import type { HintHuntRound, MapStation } from "@/api/types";

export const HINT_HUNT_RESULT_MS = 60_000;

/** The hint a guess counts from, or the only one (agreement 6.1, BAC-208). */
const GUESS_FROM_HINT = 2;

/** The stations the map gives a card and polls for: enabled ones running the hint hunt. */
export function hintHuntStations(stations: readonly MapStation[]): MapStation[] {
  return stations.filter((station) => station.game === "hint_hunt" && !station.disabled);
}

const END_MESSAGES: Record<NonNullable<HintHuntRound["ended_how"]>, string> = {
  won: "Found! Someone matched every hint.",
  lost_tries: "Not found. No tries left.",
  lost_time: "Not found. Time ran out.",
  too_few: "Not enough players. A round needs 3 from 2 groups.",
  no_target: "No round. Nobody who tapped in has answered the questions yet.",
};

/** Expiry and countdowns use wall time so a delayed poll cannot freeze the display. */
export function hintHuntState(round: HintHuntRound | undefined, now: number) {
  if (!round || (round.ended_at && now >= Date.parse(round.ended_at) + HINT_HUNT_RESULT_MS))
    return "idle";
  if (round.ended_at) return "ended";
  return round.started_at ? "running" : "joining";
}

export function hintHuntMessage(round: HintHuntRound | undefined, now: number) {
  const state = hintHuntState(round, now);
  if (!round || state === "idle") return "Tap the station to start a round.";
  if (state === "joining") return `${round.players} in`;
  if (state === "ended") return round.ended_how ? END_MESSAGES[round.ended_how] : "";
  if (round.hints.length < GUESS_FROM_HINT && round.next_hint_at)
    return "Guessing opens with the second hint.";
  return "Whoever matches every hint taps the station.";
}

export function hintHuntCountdown(round: HintHuntRound | undefined, now: number) {
  const seconds = (until: string) => Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
  const state = hintHuntState(round, now);
  if (!round) return null;
  if (state === "joining") return `${seconds(round.joining_until)}s left to tap in`;
  if (state !== "running") return null;
  if (round.next_hint_at) return `Next hint in ${seconds(round.next_hint_at)}s`;
  return round.ends_at ? `Last hint. ${seconds(round.ends_at)}s left to find them.` : null;
}
