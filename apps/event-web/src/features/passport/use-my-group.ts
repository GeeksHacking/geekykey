import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { POLL_MY_GROUP_PLACED_MS, POLL_MY_GROUP_WAITING_MS } from "@/lib/constants";

/** The participant's own group, polled so it appears without a reload (spec: participant groups). */
export function useMyGroup() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.myGroup,
    queryFn: () => api.myGroup(),
    refetchInterval: (query) =>
      query.state.data?.status === "placed" ? POLL_MY_GROUP_PLACED_MS : POLL_MY_GROUP_WAITING_MS,
  });
}
