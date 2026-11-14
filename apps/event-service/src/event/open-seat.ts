import type { Db } from "../db/pool.ts";
import type { Game } from "./games.ts";

/**
 * A user's latest seat, as /me gives it to the person who opened it and the person who took it
 * (the API agreement's 8.1, BAC-190). Nobody else sees it.
 */
export interface MySeat {
  /** `open` until it is taken or `closesAt` passes, then `taken` or `closed`. */
  status: "open" | "taken" | "closed";
  /** Whether this user opened the seat or took it. */
  role: "sitter" | "taker";
  stationId: string;
  /** The station's booth, or null for none. */
  booth: string | null;
  openedAt: string;
  closesAt: string;
  takenAt: string | null;
  /** The other person's current name once the seat is taken, or null. */
  otherDisplayName: string | null;
  /** What the station asked the two to ask each other, once taken, or null. */
  prompt: string | null;
}

/** The seat open now, for the map (9.10): a station and a time, and nothing about who opened it. */
export interface OpenSeatNow {
  stationId: string;
  closesAt: string;
}

/** /me and the map reach the open seat's records through this; the base imports no game. */
export interface OpenSeatGame extends Game {
  seatOf(db: Db, userId: string, now: Date): Promise<MySeat | null>;
  openNow(db: Db, now: Date): Promise<OpenSeatNow | null>;
}

export function isOpenSeatGame(game: Game): game is OpenSeatGame {
  return game.id === "open_seat" && "seatOf" in game && "openNow" in game;
}
