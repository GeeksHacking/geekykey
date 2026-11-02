import type { Stamp } from "@/api/types";
import {
  CHARACTERS,
  type CharacterKey,
  type Piece,
  type PieceKey,
} from "@/features/passport/avatar/art";

export interface Slot {
  piece: Piece;
  /** The stamp slot that gives this piece. */
  stamp: Stamp;
  worn: boolean;
}

export interface Outfit {
  /** One per stamp slot, up to the number of pieces there are. */
  slots: Slot[];
  worn: number;
  /** Every slot stamped. An event with fewer slots than pieces completes with fewer. */
  complete: boolean;
}

/**
 * Which of their character's pieces the guest wears, from 8.1's stamps. The slots come oldest first and keep
 * their order, so slot i always gives piece i and a guest's pieces never swap places.
 * The passport decides nothing else: a stamp is worn when 8.1 says it is earned.
 */
export function outfitFrom(stamps: readonly Stamp[], character: CharacterKey = "suit"): Outfit {
  const slots = CHARACTERS[character].pieces.slice(0, stamps.length).map((piece, i) => {
    const stamp = stamps[i]!;
    return { piece, stamp, worn: stamp.earned_at !== null };
  });
  const worn = slots.filter((slot) => slot.worn).length;
  return { slots, worn, complete: slots.length > 0 && worn === slots.length };
}

/**
 * The demo's outfit (FRO-105, for the meeting on Thu 5 Nov): every one of the character's pieces,
 * worn when the organizer has put it on, whatever the stamps say. A piece past the event's last
 * stamp slot names no real station, so its stamp is a stand-in called "the demo".
 */
export function demoOutfitFrom(
  stamps: readonly Stamp[],
  character: CharacterKey,
  on: readonly PieceKey[],
): Outfit {
  const slots = CHARACTERS[character].pieces.map((piece, i) => {
    const stamp = stamps[i] ?? {
      station_id: `demo-${piece.key}`,
      name: "the demo",
      location: null,
      points: 0,
      link: null,
      earned_at: null,
    };
    return { piece, stamp, worn: on.includes(piece.key) };
  });
  const worn = slots.filter((slot) => slot.worn).length;
  return { slots, worn, complete: worn === slots.length };
}
