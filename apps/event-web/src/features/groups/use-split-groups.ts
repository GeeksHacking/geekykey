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
    // A refusal can mean the board has moved on since the last poll, so the dialog's line and
    // warning catch up at once rather than contradicting the refusal for up to 5 seconds.
    onError: () => {
      // Not returned, so the refusal shows without waiting for the board.
      void queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard });
    },
  });
}
