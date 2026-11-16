import {
  LINE_LENGTH,
  MAX_COUNTDOWN_SECONDS,
  SECONDS_LEFT,
  type Countdown,
} from "@geekykey/handoff";
import type { StationText } from "../../event/games.ts";

/** Wording for the API agreement's 6.1, next version after 0.14 (BAC-203). */
export const HINT_HUNT_LINES = {
  idle: ["Hint hunt", "Tap to join"],
  noGroup: ["Join a group", "on your phone"],
  tooFew: ["Need 3 players", "from 2 groups"],
  noTarget: ["No answers yet", "Round over"],
  running: ["Round running", "Join next one"],
  lostTries: ["No match", "Round lost"],
  lostTime: ["Time's up", "Round lost"],
  won: ["Found a match!", "Round won"],
  joiningEnding: ["Hints coming", ""],
};

function secondsTo(at: string, now: Date) {
  return Math.min(
    MAX_COUNTDOWN_SECONDS,
    Math.max(1, Math.ceil((Date.parse(at) - now.getTime()) / 1000)),
  );
}

export function plain(lines: string[], complete = false): StationText {
  return { lines, complete };
}

function ticking(countdown: Countdown, lines = countdown.lines): StationText {
  return {
    complete: false,
    lines: lines.map((line) => line.replace(SECONDS_LEFT, String(countdown.seconds))),
    countdown,
  };
}

export function joiningScreen(players: number, until: string, now: Date, repeat = false) {
  let line = `${players} in, ${SECONDS_LEFT}s left`;
  if (line.replace(SECONDS_LEFT, "99").length > LINE_LENGTH) line = `${SECONDS_LEFT}s left`;
  return ticking(
    {
      seconds: secondsTo(until, now),
      lines: ["Hint hunt", line],
      ending: HINT_HUNT_LINES.joiningEnding,
    },
    [repeat ? "Already in" : "Hint hunt", line],
  );
}

export function hintScreen(
  shorts: string[],
  until: string,
  last: boolean,
  now: Date,
  triesLeft?: number,
) {
  let hints = shorts.join(" ");
  if (hints.length > LINE_LENGTH) hints = shorts.map((short) => short.replace(/^Q/, "")).join(" ");
  // An event with very many questions still fits whole short hints, never half of one (6.1).
  while (hints.length > LINE_LENGTH) hints = hints.slice(hints.indexOf(" ") + 1);
  const line = last ? `Last! ${SECONDS_LEFT}s left` : `Next hint ${SECONDS_LEFT}s`;
  const miss =
    triesLeft === undefined ? line : `No! ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left`;
  return ticking({
    seconds: secondsTo(until, now),
    lines: [hints, miss],
    ending: last ? HINT_HUNT_LINES.lostTime : [hints, "Next hint..."],
  });
}
