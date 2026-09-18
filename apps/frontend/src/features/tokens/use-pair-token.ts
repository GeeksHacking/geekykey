import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/** POST /tokens/pair. The token list lives in /me, so that query refetches on success. */
export function usePairToken() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => api.pairToken(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
