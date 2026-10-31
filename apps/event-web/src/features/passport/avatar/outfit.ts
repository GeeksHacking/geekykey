import type { Stamp } from "@/api/types";
import { PIECES, type Piece } from "@/features/passport/avatar/art";

export interface Slot {
  piece: Piece;
  /** The stamp slot that gives this piece. */
  stamp: Stamp;
  worn: boolean;
}

export interface Outfit {
  /** One per stamp slot, up to the six pieces there are. */
  slots: Slot[];
  worn: number;
  /** Every slot stamped. An event with fewer than six slots completes with fewer pieces. */
  complete: boolean;
}

/**
 * Which pieces the guest wears, from 8.1's stamps. The slots come oldest first and keep
 * their order, so slot i always gives piece i and a guest's pieces never swap places.
 * The passport decides nothing else: a stamp is worn when 8.1 says it is earned.
 */
export function outfitFrom(stamps: readonly Stamp[]): Outfit {
  const slots = PIECES.slice(0, stamps.length).map((piece, i) => {
    const stamp = stamps[i]!;
    return { piece, stamp, worn: stamp.earned_at !== null };
  });
  const worn = slots.filter((slot) => slot.worn).length;
  return { slots, worn, complete: slots.length > 0 && worn === slots.length };
}
