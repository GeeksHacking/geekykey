import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** POST /api/v1/admin/groups/reset answers with the board, so that goes straight into its cache. */
export function useResetGroups() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetGroups(),
    onSuccess: (board) => {
      // A poll asked for before the press would put everyone back in their groups.
      void queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
      queryClient.setQueryData(queryKeys.groupBoard, board);
    },
  });
}
