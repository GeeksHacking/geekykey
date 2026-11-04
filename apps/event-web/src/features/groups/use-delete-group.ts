import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** DELETE /api/v1/admin/groups/{id}. The board refetches, with its members back on the waiting list. */
export function useDeleteGroup() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => api.deleteGroup(groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard }),
  });
}
