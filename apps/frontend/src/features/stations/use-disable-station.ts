import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/**
 * POST /admin/stations/{id}/disable (agreement 9.9). The board refetches on success.
 *
 * Only the board, like the replace-key call and unlike create and passport, which
 * also invalidate the stats and /me. Disabling changes no one's stamps or points
 * (9.2 keeps a disabled station's slot and stamps) and no stored tap (9.9 keeps the
 * station's taps), so those queries have nothing to answer differently. The board
 * is refetched because FRO-26 asks for it; the poll would get there, up to its
 * usual 15 seconds later than the organizer's click.
 */
export function useDisableStation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stationId: string) => api.disableStation(stationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.stationBoard });
    },
  });
}
