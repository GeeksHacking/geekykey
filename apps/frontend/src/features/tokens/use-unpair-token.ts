import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** DELETE /tokens/{uid}. */
export function useUnpairToken() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => api.unpairToken(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
