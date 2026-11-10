import type { Connection } from "@/api/types";
import {
  CHARACTERS,
  type CharacterKey,
  type Piece,
  type PieceKey,
} from "@/features/passport/avatar/art";

export interface Slot {
  piece: Piece;
  worn: boolean;
}

export interface Outfit {
  /** One per piece the character has, in the order the connections and wins fill them. */
  slots: Slot[];
  worn: number;
  /** Every piece worn, which the character's last piece completes. */
  complete: boolean;
}

/**
 * How many pieces the guest has earned: one for each connection, and one more for each win
 * (FRO-134). A connection has one challenge, the dice or the reaction test, and the service
 * answers `win` for a tie too, so a win adds exactly one. A connection from before the
 * challenges has neither, and gives one.
 */
export function piecesEarned(connections: readonly Connection[]): number {
  return connections.reduce((count, connection) => count + 1 + (won(connection) ? 1 : 0), 0);
}

function won(connection: Connection): boolean {
  return connection.dice?.result === "win" || connection.reaction?.result === "win";
}

/**
 * The pieces the guest wears, capped at the character's own count. Every character has the
 * same number, which `outfit.test.ts` checks, so a poll can compare this without knowing
 * which character the guest picked.
 */
export function wornPieces(
  connections: readonly Connection[],
  character: CharacterKey = "suit",
): number {
  return Math.min(piecesEarned(connections), CHARACTERS[character].pieces.length);
}

/**
 * Which of their character's pieces the guest wears, one per connection and one more for a
 * win, up to the character's four pieces. The pieces keep their fixed order, so the first
 * connection gives the first piece, a win's extra piece is the next one, and a guest's
 * pieces never swap places. Later connections and wins leave a complete outfit as it is.
 * Only how many connections and wins there are matters, since 8.1 lists the connections
 * newest first.
 */
export function outfitFrom(
  connections: readonly Connection[],
  character: CharacterKey = "suit",
): Outfit {
  const worn = wornPieces(connections, character);
  const slots = CHARACTERS[character].pieces.map((piece, index) => ({
    piece,
    worn: index < worn,
  }));
  return { slots, worn, complete: slots.length > 0 && worn === slots.length };
}

/**
 * The demo's outfit (FRO-105): every one of the character's pieces, worn when the organizer
 * has put it on, whatever the guest's connections say.
 */
export function demoOutfitFrom(character: CharacterKey, on: readonly PieceKey[]): Outfit {
  const slots = CHARACTERS[character].pieces.map((piece) => ({
    piece,
    worn: on.includes(piece.key),
  }));
  const worn = slots.filter((slot) => slot.worn).length;
  return { slots, worn, complete: slots.length > 0 && worn === slots.length };
}
