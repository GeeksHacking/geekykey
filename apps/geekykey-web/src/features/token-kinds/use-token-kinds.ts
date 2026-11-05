import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { TokenKind } from "@/api/types";

/** GET /api/v1/admin/token-kinds (BAC-139): how many tokens each kind has on the list. */
export function useTokenKinds() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.tokenKinds,
    queryFn: () => api.getTokenKinds(),
  });
}

/**
 * POST /api/v1/admin/token-kinds (BAC-139). A load changes the list, so success
 * refetches its totals. It isn't retried by itself: sending the tokens again is safe,
 * but the second answer would count them as unchanged, and the person loading wants to
 * know what the first one did. Pressing Load again after a failure is theirs to choose.
 */
export function useLoadTokenKinds() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokens: TokenKind[]) => api.loadTokenKinds(tokens),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tokenKinds }),
  });
}
