import type { Reaction, ReactionPlay } from "@/api/types";

/*
  The reaction test's sentences, from section 13 of agreement 0.14
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

/** The time left to play, with seconds always two digits (FRO-152, section 13). */
export function timeLeftLine(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return `Time left to play: ${minutes}:${seconds}.`;
}

/** What the screen says while it reads /me again after the deadline or a refusal. */
export const CHECKING_RESULT = "Checking the result...";

/** What the screen says when that read fails, beside its Try again button. */
export const CHECK_FAILED = "Couldn't check the result. Try again.";
