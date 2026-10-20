import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { SetStationPassportRequest } from "@/api/types";

/**
 * PUT /admin/stations/{id}/passport (agreement 9.1).
 *
 * Invalidates the board, /me (the station becomes a passport stamp slot) and the stats,
 * so a participant's passport and the organiser's totals agree after the change.
 */
export function useSetStationPassport() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stationId, input }: { stationId: string; input: SetStationPassportRequest }) =>
      api.setStationPassport(stationId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stationBoard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      ]);
    },
  });
}
