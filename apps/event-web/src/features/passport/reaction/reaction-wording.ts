import type { Reaction, ReactionPlay } from "@/api/types";

/*
  The reaction test's sentences, from section 13's draft for the agreement's next version
  (BAC-156). The reveal and the list say the same once the result comes.
*/

export function yourLine(play: ReactionPlay, ms: number | null): string | null {
  if (play === "played") return `You took ${ms} ms.`;
  if (play === "early") return "You tapped too soon.";
  if (play === "missed") return "You didn't play in time.";
  return null;
}

export function theirLine(play: ReactionPlay, ms: number | null): string {
  if (play === "played") return `They took ${ms} ms.`;
  if (play === "early") return "They tapped too soon.";
  return "They didn't play in time.";
}

export function resultLine({ your_ms, their_ms, result }: Reaction): string {
  if (your_ms !== null && your_ms === their_ms) return "You both win!";
  if (result === "win") return "You win!";
  return their_ms === null ? "Nobody wins." : "They win!";
}

/** What the user played, before the result: their own time or a tap too soon. */
export function playedLine(ms: number | null): string {
  return ms === null ? "Too soon! You tapped before green." : `You took ${ms} ms.`;
}
