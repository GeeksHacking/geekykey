import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

export function useSetStationGame(stationId: string) {
  const api = useApi();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (game: string) => api.setStationGame(stationId, game === "none" ? null : game),
    onSuccess: async () => {
      await cache.cancelQueries({ queryKey: queryKeys.stationBoard });
      await Promise.all(
        [queryKeys.stationBoard, queryKeys.me, queryKeys.map].map((queryKey) =>
          cache.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
