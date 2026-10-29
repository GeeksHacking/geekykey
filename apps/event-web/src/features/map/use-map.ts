import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { POLL_MAP_MS } from "@/lib/constants";

/**
 * The map's data (agreement 9.10), polled every 2 seconds while the map is shown. A `forbidden`
 * stops the polling, since the account won't be allowed until it signs out.
 */
export function useMap() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.map,
    queryFn: () => api.map(),
    refetchInterval: (query) =>
      isApiErrorCode(query.state.error, "forbidden") ? false : POLL_MAP_MS,
  });
}
