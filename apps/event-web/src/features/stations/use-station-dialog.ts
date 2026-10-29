import { useState } from "react";

/**
 * Which station's dialog is open, if any. Each call keeps its own state, so the board can
 * hold one of these per dialog and only one dialog of that kind is ever open, with closing it
 * needing no per-row state.
 */
export function useStationDialog() {
  const [stationId, setStationId] = useState<string | null>(null);

  return {
    stationId,
    openFor: (id: string) => setStationId(id),
    close: () => setStationId(null),
    isOpenFor: (id: string) => stationId === id,
  };
}
