import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { isApiErrorCode } from "@/api/errors";
import { normalizeUid } from "@/lib/token-uid";

/**
 * DELETE /api/v1/tokens/{uid} (agreement 8.3). Lives in lib/ so two features can share it,
 * the token page's owner view and My tokens' rows (apps/event-web/CLAUDE.md: cross-feature
 * imports go through components/ or lib/, never feature to feature).
 *
 * `ownerId` is passed by the caller and only a GeekyKey admin sends one: 8.3 releases
 * someone else's token by naming the owner the lookup showed. The service answers
 * `not_found` if that owner no longer matches, which is what makes a late click safe.
 *
 * A release is never retried automatically, unlike a claim. A claim that is sent twice
 * answers 200 and changes nothing, but a release whose answer was lost would come back as
 * `not_found`, so retrying would tell the user someone else had taken a token they had just
 * released themselves. A transport failure is shown with a Try again instead.
 */
export function useReleaseToken(rawUid: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const uid = normalizeUid(rawUid);

  return useMutation({
    mutationFn: (ownerId?: string) => api.releaseToken(uid, ownerId),

    // A release changes what /me holds and what the token page shows.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.token(uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
    },

    // 8.3's not_found means the token is no longer the one the lookup showed, so the page
    // is holding stale data and only a fresh lookup can settle what happened.
    onError: async (error) => {
      if (isApiErrorCode(error, "not_found")) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.token(uid) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        ]);
      }
    },
  });
}
