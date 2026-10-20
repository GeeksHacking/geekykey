import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { CreateStationRequest } from "@/api/types";

/** POST /api/v1/admin/stations (agreement 9.7). The board refetches on success. */
export function useCreateStation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStationRequest) => api.createStation(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stationBoard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      ]);
    },
  });
}
