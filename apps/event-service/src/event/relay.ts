import type { Db } from "../db/pool.ts";
import type { Game } from "./games.ts";

/** Counts and station IDs only, for the API agreement's 9.13 (BAC-184). */
export interface RelayMapState {
  stations: string[];
  game: {
    started_at: string;
    transfers: number;
    transfers_needed: number;
    calling_station_id: string | null;
    waiting_station_id: string | null;
    waiting_until: string | null;
    ended_at: string | null;
    complete: boolean;
  } | null;
}

/** The map reaches relay records through this interface; the base imports no game. */
export interface RelayGame extends Game {
  mapState(db: Db, now: Date): Promise<RelayMapState>;
}

export function isRelayGame(game: Game): game is RelayGame {
  return game.id === "relay" && "mapState" in game && typeof game.mapState === "function";
}
