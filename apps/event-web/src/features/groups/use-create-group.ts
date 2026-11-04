import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { CreateGroupRequest } from "@/api/types";

/** POST /api/v1/admin/groups. The board refetches on success. */
export function useCreateGroup() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupRequest) => api.createGroup(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard }),
  });
}
