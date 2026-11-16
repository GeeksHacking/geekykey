import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { POLL_MAP_HINT_HUNT_MS } from "@/lib/constants";

/** Its own 90/minute budget. Match the relay's quiet failure and stale-data policy. */
export function useMapHintHunt(enabled: boolean) {
  const api = useApi();
  const query = useQuery({
    queryKey: queryKeys.mapHintHunt,
    queryFn: () => api.mapHintHunt(),
    enabled,
    // The next poll is a second away, so a retry only adds requests, as with the relay's.
    retry: false,
    refetchInterval: (query) =>
      isApiErrorCode(query.state.error, "forbidden") ? false : POLL_MAP_HINT_HUNT_MS,
  });
  const failure = query.failureReason ?? query.error;
  return {
    data: enabled && (!failure || isApiErrorCode(failure, "rate_limited")) ? query.data : undefined,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
