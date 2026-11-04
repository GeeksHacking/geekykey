import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** POST /api/v1/me/group answers as the read does, so the answer goes straight into its cache. */
export function useJoinGroups() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.joinGroups(),
    onSuccess: (answer) => {
      // A poll asked for before the join would put `not_joined` back when it landed.
      void queryClient.cancelQueries({ queryKey: queryKeys.myGroup });
      queryClient.setQueryData(queryKeys.myGroup, answer);
    },
  });
}
