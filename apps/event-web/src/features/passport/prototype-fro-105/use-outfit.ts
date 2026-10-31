/*
  PROTOTYPE (FRO-105), throwaway. Which pieces the guest wears, from 8.1's stamps.

  Slot i of `stamps` gives PIECES[i]. The prototype starts from the real stamps, then the
  floating bar's + and - buttons fake taps so the "new piece" animation can be watched.
*/
import { useMemo, useState } from "react";

import type { Stamp } from "@/api/types";

import { PIECES, type Piece } from "@/features/passport/prototype-fro-105/art";

export interface Slot {
  piece: Piece;
  /** The stamp slot behind this piece, or null when the event has fewer than six. */
  stamp: Stamp | null;
  worn: boolean;
}

/** The order fake taps arrive in, so the hat isn't always first. */
const FAKE_ORDER = [2, 0, 4, 1, 5, 3];

export function useOutfit(stamps: Stamp[]) {
  const [worn, setWorn] = useState<Set<number>>(
    () => new Set(PIECES.flatMap((_, i) => (stamps[i]?.earned_at ? [i] : []))),
  );
  const [lastAdded, setLastAdded] = useState<{ index: number; at: number } | null>(null);

  const slots: Slot[] = useMemo(
    () => PIECES.map((piece, i) => ({ piece, stamp: stamps[i] ?? null, worn: worn.has(i) })),
    [stamps, worn],
  );
  const next = slots.find((slot) => !slot.worn) ?? null;

  function add() {
    const index = FAKE_ORDER.find((i) => !worn.has(i));
    if (index === undefined) return;
    setWorn(new Set([...worn, index]));
    setLastAdded({ index, at: Date.now() });
  }

  function remove() {
    const index = [...FAKE_ORDER].reverse().find((i) => worn.has(i));
    if (index === undefined) return;
    const rest = new Set(worn);
    rest.delete(index);
    setWorn(rest);
    setLastAdded(null);
  }

  return { slots, next, wornCount: worn.size, lastAdded, add, remove };
}

export type Outfit = ReturnType<typeof useOutfit>;
