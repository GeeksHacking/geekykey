import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { SplitGroupsRequest } from "@/api/types";

/** POST /api/v1/admin/groups/split answers with the board, so that goes straight into its cache. */
export function useSplitGroups() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SplitGroupsRequest) => api.splitGroups(input),
    onSuccess: (board) => {
      // A poll asked for before the press would show the board with no groups again.
      void queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
      queryClient.setQueryData(queryKeys.groupBoard, board);
    },
  });
}
