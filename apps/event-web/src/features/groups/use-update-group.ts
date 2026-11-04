import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { UpdateGroupRequest } from "@/api/types";

/** PUT /api/v1/admin/groups/{id}. The board refetches on success. */
export function useUpdateGroup() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: UpdateGroupRequest }) =>
      api.updateGroup(groupId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard }),
  });
}
