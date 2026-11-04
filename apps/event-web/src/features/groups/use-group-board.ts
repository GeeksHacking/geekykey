import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { POLL_GROUP_BOARD_MS } from "@/lib/constants";

/** The organisers' board of groups, polled so they can watch people arrive. */
export function useGroupBoard() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groupBoard,
    queryFn: () => api.groupBoard(),
    refetchInterval: POLL_GROUP_BOARD_MS,
  });
}
