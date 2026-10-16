import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/**
 * POST /admin/stations/{id}/key (agreement 9.8). The board refetches on success.
 *
 * Only the board, unlike the create and the passport calls, which also invalidate the
 * stats and /me. A key is never in any answer the app reads back, and 9.8 keeps the
 * station's ID, its passport settings and its stamps, so /me is unchanged and no tap
 * changes status, so the stats are unchanged too. The board is refetched because FRO-28
 * asks for it; its own poll would get there once the old key stops working.
 */
export function useReplaceStationKey() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stationId: string) => api.replaceStationKey(stationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.stationBoard });
    },
  });
}
