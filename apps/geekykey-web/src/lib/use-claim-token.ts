import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import { isApiErrorCode, NetworkError } from "@/api/errors";
import type { Token } from "@/api/types";
import { normalizeUid } from "@/lib/token-uid";

/**
 * POST /api/v1/tokens/{uid}/claim, agreement 8.2. Lives in lib/ so two features can share
 * it, the token page's owner view and My tokens' claim-by-code form (apps/event-web/CLAUDE.md:
 * cross-feature imports go through components/ or lib/, never feature to feature).
 *
 * The UID is the mutation's variable, so each caller passes the token it is claiming. The
 * token page knows its token from the address; the form learns it from what the user typed,
 * which is why the UID cannot be an argument of the hook.
 *
 * A claim changes what /me holds, so success refetches the token lookup and /me. The UID is
 * normalised first, or the two spellings of one token would be two cache entries.
 *
 * The checks are the service's, in the order 8.2 fixes: already yours answers 200 whatever
 * the count, then a user holding 3 gets token_limit_reached, then token_taken. Nothing here
 * reorders them, because the screen's wording depends on which one the service chose.
 */
export function useClaimToken() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rawUid: string): Promise<Token> => api.claimToken(normalizeUid(rawUid)),
    onSuccess: async (_token, rawUid) => {
      const uid = normalizeUid(rawUid);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.token(uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
    },
    // Agreement 13: on token_taken the error names no owner, so the page shows what a
    // fresh lookup answers, under the sentence. The two can disagree, and the sentence
    // stays either way, so the lookup is refetched rather than the error being trusted for
    // the view. Only token_taken changes who owns it; the other failures change nothing.
    onError: async (error, rawUid) => {
      if (isApiErrorCode(error, "token_taken")) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.token(normalizeUid(rawUid)) });
      }
    },
    // A claim is not idempotent from the user's point of view, but 200 means it already
    // succeeded, so a lost response should be retried rather than shown as a failure.
    retry: (failureCount, error) => error instanceof NetworkError && failureCount < 2,
  });
}
