import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** POST /api/v1/admin/groups/allocate answers with the board, so that goes straight into its cache. */
export function useAllocateGroups() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.allocateGroups(),
    onSuccess: (board) => {
      // A poll asked for before the press would put everyone back on the waiting list.
      void queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
      queryClient.setQueryData(queryKeys.groupBoard, board);
    },
  });
}
