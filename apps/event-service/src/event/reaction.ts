import type { Reaction, ReactionPlay } from "./connections.ts";

/** How long after a connection each person has to play its reaction test (the API agreement's 8.1, BAC-156). */
export const REACTION_WINDOW_MS = 2 * 60 * 1000;

/** One person's side of a stored reaction test: their time, and when their play arrived. */
export interface ReactionSide {
  ms: number | null;
  at: string | null;
}

function playOf({ ms, at }: ReactionSide, over: boolean): ReactionPlay {
  if (at !== null) return ms === null ? "early" : "played";
  return over ? "missed" : "not_played";
}

/**
 * A reaction test from one side at `now` (the API agreement's 8.1, BAC-156). The result comes
 * once both have played or the 2 minutes have passed. A time beats an early tap or no play, the
 * faster time wins, equal times win for both, and with no time on either side nobody wins.
 */
export function reactionFrom(
  connectedAt: string,
  you: ReactionSide,
  them: ReactionSide,
  now: Date,
): Reaction {
  const playBy = new Date(Date.parse(connectedAt) + REACTION_WINDOW_MS).toISOString();
  const over = now.toISOString() >= playBy;
  const yourPlay = playOf(you, over);
  const theirPlay = playOf(them, over);
  const yourMs = yourPlay === "played" ? you.ms : null;
  const theirMs = theirPlay === "played" ? them.ms : null;
  if (yourPlay === "not_played" || theirPlay === "not_played") {
    // Until the result, an early tap looks like any play, and their time stays hidden.
    return {
      playBy,
      yourPlay,
      yourMs,
      theirPlay: theirPlay === "early" ? "played" : theirPlay,
      theirMs: null,
      result: null,
    };
  }
  const result =
    yourMs !== null && (theirMs === null || yourMs <= theirMs)
      ? ("win" as const)
      : ("loss" as const);
  return { playBy, yourPlay, yourMs, theirPlay, theirMs, result };
}
