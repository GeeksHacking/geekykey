import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { EventStationBoardResponse } from "@/api/types";
import { allStationOptions } from "@/features/stations/station-options";

/** Station names for the scan-log filter, selected from the shared raw board query. */
export function useStationOptions() {
  const api = useApi();
  const query = useQuery({
    queryKey: queryKeys.stationBoard,
    queryFn: () => api.listStationBoard(),
    select: (board: EventStationBoardResponse) => ({
      stations: allStationOptions(board.stations),
    }),
    staleTime: 60_000,
  });
  return {
    stations: query.data?.stations ?? [],
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
