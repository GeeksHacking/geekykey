import type { Db } from "../db/pool.ts";
import type { Reaction, ReactionPlayResult } from "./connections.ts";
import type { Game } from "./games.ts";

/** BAC-155, agreement 8.1 and 8.11. No other user's ID leaves /me. */
export interface Round {
  id: string;
  state: "opening" | "playing" | "ended";
  closes_at: string;
  players: number;
  challenge: "dice" | "reaction" | null;
  team: "a" | "b" | null;
  teammates: string[];
  duels: {
    id: string;
    opponent: string;
    dice: { your_roll: number; their_roll: number; result: "win" | "loss" } | null;
    reaction: Reaction | null;
  }[];
  result: {
    outcome: "win" | "loss" | "nobody_joined";
    your_team_wins: number;
    their_team_wins: number;
  } | null;
}

export interface TeamDuelsGame extends Game {
  roundsOf(db: Db, userId: string, now: Date): Promise<{ round: Round | null; round_wins: number }>;
  playReaction(
    db: Db,
    play: { duelId: string; userId: string; ms: number | null },
    now: Date,
  ): Promise<ReactionPlayResult>;
}
