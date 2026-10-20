import { useState } from "react";

/**
 * Which station's passport dialog is open, if any. One piece of state for the whole
 * board, so only one dialog can ever be open and closing one needs no per-row state.
 */
export function usePassportStationDialog() {
  const [stationId, setStationId] = useState<string | null>(null);

  return {
    stationId,
    openFor: (id: string) => setStationId(id),
    close: () => setStationId(null),
    isOpenFor: (id: string) => stationId === id,
  };
}
