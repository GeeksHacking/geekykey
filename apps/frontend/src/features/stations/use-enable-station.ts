import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/**
 * POST /admin/stations/{id}/enable (agreement 9.9). The board refetches on success.
 *
 * Only the board, same reasons as the disable call: enabling empties disabled_at and
 * touches no stamp, no slot and no stored tap, and the saved taps count only once the
 * services deliver them, outside this app's queries. The board is refetched because
 * FRO-26 asks for it; between polls a just-enabled row would read as still disabled.
 */
export function useEnableStation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stationId: string) => api.enableStation(stationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.stationBoard });
    },
  });
}
