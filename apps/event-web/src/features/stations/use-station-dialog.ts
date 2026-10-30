import { useState } from "react";

/**
 * Which station's dialog is open, if any, and the button that opened it. Each call keeps its
 * own state, so the board can hold one of these per dialog and only one dialog of that kind is
 * ever open, with closing it needing no per-row state.
 *
 * The opener is kept after the dialog closes, because the close-focus handler runs on a render
 * where the dialog is already closed and still needs to know where the keyboard goes (FRO-99).
 */
export function useStationDialog() {
  const [stationId, setStationId] = useState<string | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  return {
    stationId,
    opener,
    openFor: (id: string, opener: HTMLElement) => {
      setStationId(id);
      setOpener(opener);
    },
    close: () => setStationId(null),
    isOpenFor: (id: string) => stationId === id,
  };
}
