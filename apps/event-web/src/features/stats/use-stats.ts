import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { POLL_TAPS_MS } from "@/lib/constants";

export function useStats() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api.stats(),
    refetchInterval: POLL_TAPS_MS,
  });
}
