import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { POLL_STATIONS_MS } from "@/lib/constants";

/** Event Service station board (agreement 9.2), polled every 12 seconds. */
export function useStationBoard() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.stationBoard,
    queryFn: () => api.listStationBoard(),
    refetchInterval: POLL_STATIONS_MS,
  });
}
