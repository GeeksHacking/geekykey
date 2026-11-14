import { useEffect, useState } from "react";

import type { MapStation } from "@/api/types";
import { seatMarks, type SeatMark } from "@/features/map/seat-marks";

/**
 * The open seat marks, with the previous poll kept so a seat that goes before its closing time
 * shows "Taken" for one poll. `polledAt` is the map's last update time, so an answer the query
 * kept by structural sharing still counts as a new poll. The seconds tick every second; the
 * map's 2-second poll is the only request.
 */
export function useOpenSeatMarks(
  stations: readonly MapStation[],
  polledAt: number,
): Map<string, SeatMark> {
  const [observed, setObserved] = useState<{
    current: readonly MapStation[];
    previous?: readonly MapStation[];
    polledAt: number;
  }>({ current: stations, polledAt });
  if (observed.current !== stations || observed.polledAt !== polledAt) {
    setObserved({ current: stations, previous: observed.current, polledAt });
  }

  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  return seatMarks(observed.previous, stations, now);
}
