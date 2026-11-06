import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { MeResponse, ReactionPlayRequest } from "@/api/types";

/**
 * The user's one play in a connection's reaction test (BAC-156, 8.11). The service answers with
 * the test as it now stands, which goes straight into ["me"]. A refused play reads /me again
 * instead, which shows what the service kept: the earlier play, or a missed one.
 */
export function usePlayReaction(connectionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (play: ReactionPlayRequest) => api.playReaction(connectionId, play),
    onSuccess: ({ reaction }) => {
      // A poll asked for before the play would put the unplayed test back (FRO-68).
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) =>
        me
          ? {
              ...me,
              connections: me.connections.map((connection) =>
                connection.id === connectionId ? { ...connection, reaction } : connection,
              ),
            }
          : me,
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
