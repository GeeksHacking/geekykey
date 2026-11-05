import { useCallback, useEffect, useState } from "react";

import type { PieceKey } from "@/features/passport/avatar/art";

/** As long as the poll's marks last (use-passport-changes.ts), so a piece flies in the same way. */
const ARRIVING_LASTS_MS = 2_000;

export interface DemoOutfit {
  /** The pieces put on by hand, or `null` while the avatar follows the connections. */
  on: readonly PieceKey[] | null;
  /** The piece just put on, which flies in as a new connection's does. */
  arriving: readonly PieceKey[];
  toggle: (key: PieceKey) => void;
  reset: () => void;
}

/*
  The demo toggle (FRO-105), for showing the avatar without making a connection for each piece.
  Organizers only. It stays in this browser tab: nothing is saved or sent, and reloading the
  page goes back to the connections.
*/
export function useDemoOutfit(): DemoOutfit {
  const [on, setOn] = useState<readonly PieceKey[] | null>(null);
  const [arriving, setArriving] = useState<readonly PieceKey[]>([]);

  useEffect(() => {
    if (arriving.length === 0) return;
    const timer = setTimeout(() => setArriving([]), ARRIVING_LASTS_MS);
    return () => clearTimeout(timer);
  }, [arriving]);

  const toggle = useCallback(
    (key: PieceKey) => {
      const wearing = on ?? [];
      if (wearing.includes(key)) {
        setOn(wearing.filter((worn) => worn !== key));
        setArriving([]);
      } else {
        setOn([...wearing, key]);
        setArriving([key]);
      }
    },
    [on],
  );

  const reset = useCallback(() => {
    setOn(null);
    setArriving([]);
  }, []);

  return { on, arriving, toggle, reset };
}
