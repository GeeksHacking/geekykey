import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { SetStationBoothRequest } from "@/api/types";

/**
 * PUT /admin/stations/{id}/booth (agreement 9.12).
 *
 * Invalidates the board, so its row shows the booth the service kept, and the map, which
 * draws the station at that booth. Nothing else reads a booth: /me, the stats and the scan
 * log carry none.
 */
export function useSetStationBooth() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stationId, input }: { stationId: string; input: SetStationBoothRequest }) =>
      api.setStationBooth(stationId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stationBoard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.map }),
      ]);
    },
  });
}
