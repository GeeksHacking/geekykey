import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { MeResponse, UpdateMeRequest } from "@/api/types";

/**
 * PATCH /api/v1/me (agreement 8.7). The service answers with the user, so that goes
 * straight into ["me"] and the passport shows the new name or answers without another read.
 */
export function useUpdateMe() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeRequest) => api.updateMe(input),
    onSuccess: ({ user }, input) => {
      // A poll asked for before the PATCH answers with the user as they were then, so drop
      // it, or its late answer puts the old name or answers back (FRO-68).
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) => {
        if (!me) return me;
        // The name prompt and the questions can be open together, so two PATCHes can
        // overlap. Merge only the fields this request sent; replacing the whole user with
        // the slower answer would put the other field back (FRO-111).
        const next = { ...me.user };
        if (input.display_name !== undefined) {
          next.display_name = user.display_name;
          next.has_name = user.has_name;
        }
        if (input.answers !== undefined) {
          next.answers = user.answers;
        }
        return { ...me, user: next };
      });
    },
  });
}
