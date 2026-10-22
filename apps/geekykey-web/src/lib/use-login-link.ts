import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import { queryKeys } from "@/api/keys";

/**
 * POST /api/v1/login-links (agreement 8.6): a link to one event's screens, which the
 * event buttons on My tokens and the token page open, so the user arrives there as the
 * same user instead of logging in a second time.
 *
 * The link works once and expires 60 seconds after it is made, so the url is opened
 * inside the mutation and never handed back: nothing on the screens keeps it. No screen
 * builds one either, because the event's address and the fragment's name belong to the
 * GeekyKey Service.
 *
 * Lives in lib/ so two features can share it, the token page's owner view and My
 * tokens, the way use-release-token.ts does.
 */
export function useLoginLink() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { url } = await api.createLoginLink(eventId);
      window.location.assign(url);
    },

    // 8.6 answers not_found for an event_id that isn't in /me's events, so /me is stale
    // and only a fresh one settles which events there are.
    onError: async (error) => {
      if (!isApiErrorCode(error, "not_found")) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}
