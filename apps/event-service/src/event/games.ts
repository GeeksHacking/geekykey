import type { Db } from "../db/pool.ts";
import type { TapSource } from "./tap-pipeline.ts";

/**
 * The interface every game is behind. The base stores the taps, and knows no
 * game by name: src/app.ts hands the pipeline the games this event's
 * settings run (src/showcase/games.ts), and each game lives in a folder of
 * its own under src/games/.
 */

/** The database inside one ingest's transaction, with the station's row locked. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * What a game makes of one tap: it counted it, it held it back, or the tap
 * isn't one it counts. The pipeline combines every game's (spec section
 * 3.7): `accepted` if any game counted the tap, otherwise `cooldown` if one
 * held it back, otherwise `no_game`.
 */
export type GameStatus = "accepted" | "cooldown" | "no_game";

/** A tap that isn't a replay, as the games see it. */
export interface GameTap {
  clientTapId: string;
  userId: string;
  /** The station's time for the tap, or null when it sent none or one too far off to trust. */
  tappedAt: string | null;
  /** `tappedAt` when there is one, else when the tap arrived. The cooldown goes by it. */
  effectiveAt: string;
}

export interface GameContext {
  stationId: string;
  source: TapSource;
  /**
   * The ingest's transaction. The station's row is locked, so the station's
   * ingests take turns, and the taps are written in it after every game has
   * judged them. A game reads with `FOR UPDATE`, as the pipeline does, to see
   * the latest rows (TapPipeline's #lockStation says why), and writes its own
   * record of what it counted here, so the record is stored with the taps or
   * not at all.
   */
  tx: Tx;
  /**
   * The base's cooldown, for a game that uses it: for each of `taps`, whether
   * the same user has an accepted tap at this station, stored or earlier in
   * `taps`, inside the cooldown on either side of it. Taps are taken in the
   * order they happened, so a station's saved taps are judged by when they
   * were made, not when they arrived.
   */
  cooldown(taps: readonly GameTap[]): Promise<boolean[]>;
}

export interface Game {
  /** Names the game in errors. */
  name: string;
  /**
   * Judges one station's taps from one request, and returns a status for
   * each, in the same order.
   */
  judge(taps: readonly GameTap[], context: GameContext): Promise<GameStatus[]>;
}

/** One game this event runs, and the stations it runs on. */
export interface GameOnStations {
  game: Game;
  /** `all` lets the game decide for itself, as the passport does from its settings. */
  stations: "all" | readonly string[];
}

/** The status a tap is stored with, from every game's. */
export function combinedStatus(statuses: readonly GameStatus[]): GameStatus {
  if (statuses.includes("accepted")) return "accepted";
  if (statuses.includes("cooldown")) return "cooldown";
  return "no_game";
}
