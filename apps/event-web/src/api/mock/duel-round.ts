import type { DuelRound } from "@/api/types";

export const ROUND_SCENARIOS = [
  "opening",
  "playing",
  "odd",
  "win",
  "loss",
  "tie",
  "nobody",
  "live",
  "nobody-won",
  "mixed",
  "team-win",
  "timeout",
] as const;
export type RoundScenario = (typeof ROUND_SCENARIOS)[number];

export function mockDuelRound(scenario: RoundScenario, now: number): DuelRound {
  const opening = scenario === "opening" || scenario === "live";
  const playing = scenario === "playing" || scenario === "odd" || scenario === "timeout";
  const nobody = scenario === "nobody";
  const loss = scenario === "loss" || scenario === "mixed" || scenario === "nobody-won";
  return {
    id: `10000000-0000-4000-8000-${String(ROUND_SCENARIOS.indexOf(scenario)).padStart(12, "0")}`,
    state: opening ? "opening" : playing ? "playing" : "ended",
    closes_at: new Date(now + (opening ? 30_000 : 0)).toISOString(),
    players: nobody
      ? 1
      : scenario === "odd"
        ? 3
        : scenario === "mixed" || scenario === "team-win"
          ? 6
          : 4,
    challenge:
      opening || nobody ? null : playing || scenario === "nobody-won" ? "reaction" : "dice",
    team: opening || nobody ? null : "a",
    teammates: opening || nobody || scenario === "odd" ? [] : ["Mei Lin"],
    duels:
      opening || nobody
        ? []
        : (scenario === "odd" ? ["Jo", "Sam"] : ["Jo"]).map((opponent, index) => ({
            id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            opponent,
            dice:
              scenario === "nobody-won"
                ? null
                : playing
                  ? null
                  : {
                      your_roll: scenario === "team-win" || scenario === "loss" ? 2 : 5,
                      their_roll:
                        scenario === "tie"
                          ? 5
                          : scenario === "team-win" || scenario === "loss"
                            ? 6
                            : 2,
                      result: scenario === "team-win" || scenario === "loss" ? "loss" : "win",
                    },
            reaction:
              scenario === "nobody-won"
                ? {
                    play_by: new Date(now).toISOString(),
                    your_play: "missed",
                    their_play: "missed",
                    your_ms: null,
                    their_ms: null,
                    result: "loss",
                  }
                : playing
                  ? {
                      play_by: new Date(now + 120_000).toISOString(),
                      your_play: "not_played",
                      your_ms: null,
                      their_play: "played",
                      their_ms: null,
                      result: null,
                    }
                  : null,
          })),
    result:
      opening || playing
        ? null
        : {
            outcome: nobody ? "nobody_joined" : loss ? "loss" : "win",
            your_team_wins:
              nobody || scenario === "nobody-won" ? 0 : scenario === "mixed" ? 1 : loss ? 0 : 2,
            their_team_wins:
              nobody || scenario === "nobody-won"
                ? 0
                : scenario === "mixed" || scenario === "tie"
                  ? 2
                  : loss || scenario === "team-win"
                    ? 1
                    : 0,
          },
  };
}

/** Each timed side wins independently, so equal times give both sides a duel win. */
export function scoreReactions(reactions: { your_ms: number | null; their_ms: number | null }[]) {
  let your = 0;
  let their = 0;
  for (const play of reactions) {
    if (play.your_ms !== null && (play.their_ms === null || play.your_ms <= play.their_ms)) your++;
    if (play.their_ms !== null && (play.your_ms === null || play.their_ms <= play.your_ms)) their++;
  }
  return {
    outcome: your > 0 && your >= their ? ("win" as const) : ("loss" as const),
    your_team_wins: your,
    their_team_wins: their,
  };
}
