import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { ConnectAcross, GroupBoardResponse } from "@/api/types";

/**
 * PUT /api/v1/admin/connections/rule (BAC-140) answers with the setting, which goes into the
 * board's cache, since the board is where the screen reads it.
 */
export function useSetConnectionRule() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectAcross: ConnectAcross) =>
      api.setConnectionRule({ connect_across: connectAcross }),
    onSuccess: ({ connect_across }) => {
      // A poll asked for before the change would put the old setting back.
      void queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
      queryClient.setQueryData<GroupBoardResponse>(queryKeys.groupBoard, (board) =>
        board ? { ...board, connect_across } : board,
      );
    },
  });
}
