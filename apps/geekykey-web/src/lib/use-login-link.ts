import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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
 * A mutation that succeeded has opened the link and the page is leaving, so the screens
 * treat success like a request still out. A page the browser keeps and shows again on
 * Back (the back/forward cache) comes back with that state, so the hook clears it then
 * and the buttons work again.
 *
 * Lives in lib/ so two features can share it, the token page's owner view and My
 * tokens, the way use-release-token.ts does.
 */
export function useLoginLink() {
  const api = useApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
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

  const { reset } = mutation;
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) reset();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reset]);

  return mutation;
}
