import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { EventStationBoardResponse } from "@/api/types";
import { passportStationOptions } from "@/features/stations/station-options";

/** Passport-enabled stations for QR fallback, selected from the shared raw board query. */
export function useFallbackStations() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.stationBoard,
    queryFn: () => api.listStationBoard(),
    select: (board: EventStationBoardResponse) => ({
      stations: passportStationOptions(board.stations),
    }),
    staleTime: 60_000,
  });
}
