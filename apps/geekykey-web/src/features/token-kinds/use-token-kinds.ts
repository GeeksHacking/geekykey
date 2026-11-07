import type { QueryClient } from "@tanstack/react-query";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
    mutationKey: queryKeys.tokenKinds,
    mutationFn: (tokens: TokenKind[]) => api.loadTokenKinds(tokens),
    onSettled: () => refreshKinds(queryClient),
  });
}

export function useKindTokens() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.kindTokens,
    queryFn: () => api.listKindTokens(),
  });
}

/** Loads and removals share a pending state, including across navigation. */
export function useKindsWritePending() {
  return useIsMutating({ mutationKey: queryKeys.tokenKinds }) > 0;
}

export function useRemoveTokenKind() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.tokenKinds,
    mutationFn: (uid: string) => api.removeTokenKind(uid),
    retry: false,
    // A lost reply may still have removed the kind. Cancel older reads before refreshing.
    onSettled: () => refreshKinds(queryClient),
  });
}

/**
 * DELETE /api/v1/tokens/{uid}?owner_id= (agreement 8.3), from the kinds list. The owner is
 * the one the admin confirmed, so the service leaves a newer claim alone. It shares the
 * kinds list's pending state, so no second write starts while one is in flight, and it is
 * never retried: a lost reply may mean the claim has gone, and a second try would then
 * answer not_found. Either way the list, /me and that token's lookup are read again.
 */
export function useReleaseKindToken() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.tokenKinds,
    mutationFn: ({ uid, ownerId }: { uid: string; ownerId: string }) =>
      api.releaseToken(uid, ownerId),
    retry: false,
    onSettled: (_data, _error, { uid }) =>
      Promise.all([
        refreshKinds(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.token(uid) }),
      ]),
  });
}

async function refreshKinds(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: queryKeys.tokenKinds });
  await queryClient.invalidateQueries({ queryKey: queryKeys.tokenKinds });
}
