import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** DELETE /api/v1/admin/groups/members/{user_id}. The board refetches without them. */
export function useRemoveGroupMember() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeGroupMember(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard }),
  });
}
