import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import type { Meeting } from "@/api/types";

/**
 * Whether the browser says this page load is a reload or a move back or forward, not a tap.
 * Tapping a token opens its address, which is a plain navigation. Without this, going back to an
 * old token page would send a new request after the other person declined (8.8, BAC-149). A
 * browser that doesn't say counts as a tap.
 */
function pageLoadWasNotATap() {
  const [load] = performance.getEntriesByType?.("navigation") ?? [];
  const type = (load as PerformanceNavigationTiming | undefined)?.type;
  return type === "reload" || type === "back_forward";
}

/**
 * POST /api/v1/tokens/{uid}/meet (agreement 8.8): one half of a connection, which the
 * token page sends by itself once its lookup (8.5) answers `someone_else`.
 *
 * A half is a write, not a read, so it is a mutation: Query retries a failed query, and
 * sending the same half again is a second request rather than a fixed one.
 *
 * The effect sends it once per token rather than on every render. The ref outlasts
 * React's double effect in development's StrictMode, which would otherwise send the half
 * twice on one tap. 11.10 says a second half does no harm, but two requests are still two
 * reads of the claims stand-in against the 20 a minute.
 *
 * `shouldSend` is false for a GeekyKey admin, who may be holding someone's lost token and
 * whose screen offers Release instead (8.8).
 */
export function useMeeting(uid: string, shouldSend: boolean) {
  const api = useApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (tapped: string): Promise<Meeting[]> => api.meetToken(tapped),

    // 8.8 answers not_found when the token stopped being someone else's between the
    // lookup and the half: released, or claimed by whoever holds it now. Section 13 sets
    // no sentence for that, so the page asks the lookup again and its fresh owner decides
    // what to show.
    onError: async (error, tapped) => {
      if (!isApiErrorCode(error, "not_found")) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.token(tapped) });
    },
  });

  const { mutate } = mutation;
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    if (!shouldSend || sentFor.current === uid || pageLoadWasNotATap()) return;
    sentFor.current = uid;
    mutate(uid);
  }, [shouldSend, uid, mutate]);

  return mutation;
}
