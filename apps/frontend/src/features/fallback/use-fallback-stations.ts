import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** Stations for the fallback form. Same cache entry as the board and the scan-log filter. */
export function useFallbackStations() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => api.listStations(),
    staleTime: 60_000,
  });
}
