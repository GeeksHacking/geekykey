import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import { queryKeys } from "@/api/keys";

/**
 * Releases every token the current user holds (agreement 8.3), for a guest signing out.
 * A guest can't log back in, so a token left claimed would stay stuck until a GeekyKey admin
 * releases it (FRO-131).
 *
 * It reads a fresh /me first, because the cached list can miss a token claimed in another tab.
 * The service releases one token at a time, so a failure can leave some released, and trying
 * again carries on from there. 8.3's not_found on a token here means it has gone already, which
 * is what this wants, and a release whose answer was lost comes back that way.
 *
 * `userId` is who was warned. Another tab may have logged someone else in since, and the service
 * releases for whoever the cookie names, so a different user on the fresh /me stops it there.
 */
export function useReleaseMyTokens() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { user, tokens } = await api.me();
      if (user.id !== userId) throw new Error("Someone else is signed in now");
      for (const { uid } of tokens) {
        try {
          await api.releaseToken(uid);
        } catch (error) {
          if (!isApiErrorCode(error, "not_found")) throw error;
        }
      }
    },
    // Some may have gone before the failure, or the session changed, and the screens stay here.
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
