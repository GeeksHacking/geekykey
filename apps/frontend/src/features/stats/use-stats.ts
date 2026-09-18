import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

export function useStats() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.stats, queryFn: () => api.stats() });
}
