import type { Connection } from "@/api/types";
import {
  CHARACTERS,
  type CharacterKey,
  type Piece,
  type PieceKey,
} from "@/features/passport/avatar/art";
import { piecesEarned } from "@/features/passport/avatar/pieces";

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
  const worn = Math.min(piecesEarned(connections), CHARACTERS[character].pieces.length);
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
