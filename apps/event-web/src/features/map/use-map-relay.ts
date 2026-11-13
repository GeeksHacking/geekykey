import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { POLL_MAP_RELAY_MS } from "@/lib/constants";

/** A separate budget from /map. Failures quietly remove the relay, except a 429. */
export function useMapRelay(enabled: boolean) {
  const api = useApi();
  const query = useQuery({
    queryKey: queryKeys.mapRelay,
    queryFn: () => api.mapRelay(),
    enabled,
    // The next poll is a second away, so a retry only adds requests, and a pending one would
    // still go out after the last relay station has gone.
    retry: false,
    refetchInterval: (query) =>
      isApiErrorCode(query.state.error, "forbidden") ? false : POLL_MAP_RELAY_MS,
  });
  const failure = query.failureReason ?? query.error;
  return {
    data: enabled && (!failure || isApiErrorCode(failure, "rate_limited")) ? query.data : undefined,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
