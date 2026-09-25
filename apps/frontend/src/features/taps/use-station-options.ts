import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** Station names for the filter. Shares the board's cache entry, so it is free when the board is loaded. */
export function useStationOptions() {
  const api = useApi();
  const query = useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => api.listStations(),
    staleTime: 60_000,
  });
  return {
    stations: query.data?.stations ?? [],
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
