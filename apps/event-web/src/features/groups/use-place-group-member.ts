import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/**
 * PUT /api/v1/admin/groups/members/{user_id}: a group by its ID, or waiting with null. It answers
 * with the board, which goes straight into its cache, as Allocate's does.
 */
export function usePlaceGroupMember() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, groupId }: { userId: string; groupId: string | null }) =>
      api.placeGroupMember(userId, groupId),
    onSuccess: (board) => {
      // A poll asked for before the move would put them back where they were.
      void queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
      queryClient.setQueryData(queryKeys.groupBoard, board);
    },
  });
}
