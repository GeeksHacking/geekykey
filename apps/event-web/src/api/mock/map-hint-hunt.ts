import type { MockStation } from "@/api/mock/fixtures";
import type { MapHintHuntResponse, Question } from "@/api/types";

/** Start with two hints to read, then play the remaining hints, a win, and the next round, lost. */
export function mockMapHintHunt(
  stations: readonly MockStation[],
  started: number,
  now: number,
  questions: readonly Question[] | null,
): MapHintHuntResponse {
  const enabled = stations
    .filter((station) => station.game === "hint_hunt" && !station.disabled_at)
    .toSorted((a, b) => a.created_at.localeCompare(b.created_at));
  if (enabled.length === 0) return { hint_hunt: null };
  // The first read is 43 seconds into a round, seven seconds before its third hint.
  const elapsed = Math.max(0, now - started) + 43_000;
  const index = Math.floor(elapsed / 125_000);
  const cycle = started - 43_000 + index * 125_000;
  const seconds = (now - cycle) / 1000;
  const iso = (at: number) => new Date(cycle + at * 1000).toISOString();
  const hints = (questions ?? []).slice(0, 4).flatMap((question, position) => {
    const choice = question.choices[position % question.choices.length];
    return choice
      ? [
          {
            question: question.text,
            choice: choice.text,
            short: `Q${position + 1}${String.fromCharCode(65 + (position % question.choices.length))}`,
          },
        ]
      : [];
  });
  const running = seconds >= 30;
  // Every other round is lost when its time runs out, at its ends_at; a win comes 5 s earlier.
  const lost = index % 2 === 1;
  const ended = seconds >= (lost ? 70 : 65);
  const hintsShown = running ? Math.min(hints.length, 1 + Math.floor((seconds - 30) / 10)) : 0;
  return {
    hint_hunt: {
      rounds: enabled.map((station) => ({
        station_id: station.id,
        opened_at: iso(0),
        joining_until: iso(30),
        players: running ? 5 : Math.min(5, 1 + Math.floor(seconds / 6)),
        started_at: running ? iso(30) : null,
        hints: hints.slice(0, hintsShown),
        tries_left: seconds >= 40 ? 2 : 3,
        next_hint_at:
          running && !ended && hintsShown < hints.length ? iso(30 + hintsShown * 10) : null,
        ends_at: running && hintsShown === hints.length ? iso(30 + hints.length * 10) : null,
        ended_at: ended ? iso(lost ? 70 : 65) : null,
        ended_how: ended ? (lost ? "lost_time" : "won") : null,
      })),
    },
  };
}
