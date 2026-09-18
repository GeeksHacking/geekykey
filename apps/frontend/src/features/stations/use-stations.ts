import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { POLL_STATIONS_MS } from "@/lib/constants";

/** Station board data, polled so the online indicator moves without a refresh. */
export function useStations() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => api.listStations(),
    refetchInterval: POLL_STATIONS_MS,
  });
}
