import type { Db } from "../db/pool.ts";
import type { Game } from "./games.ts";

/** Counts and hints only, for the API agreement's 9.22, next version after 0.14 (BAC-203). */
export interface HintHuntMapState {
  rounds: {
    station_id: string;
    opened_at: string;
    joining_until: string;
    players: number;
    started_at: string | null;
    hints: { question: string; choice: string; short: string }[];
    tries_left: number;
    next_hint_at: string | null;
    ends_at: string | null;
    ended_at: string | null;
    ended_how: "won" | "lost_tries" | "lost_time" | "too_few" | "no_target" | null;
  }[];
}

export interface HintHuntGame extends Game {
  mapState(db: Db, now: Date): Promise<HintHuntMapState>;
}

export function isHintHuntGame(game: Game): game is HintHuntGame {
  return game.id === "hint_hunt" && "mapState" in game && typeof game.mapState === "function";
}
