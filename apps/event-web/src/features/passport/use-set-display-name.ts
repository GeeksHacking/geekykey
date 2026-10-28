import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { MeResponse } from "@/api/types";

/**
 * PATCH /api/v1/me (agreement 8.7). The service answers with the user, so that goes
 * straight into ["me"] and the passport shows the new name without another read.
 */
export function useSetDisplayName() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api.setDisplayName({ display_name: displayName }),
    onSuccess: ({ user }) => {
      // A poll asked for before the PATCH answers with the user as they were then, so drop
      // it, or its late answer puts the old name back and the prompt returns (FRO-68).
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) =>
        me ? { ...me, user } : me,
      );
    },
  });
}
