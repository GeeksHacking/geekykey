import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { HOME_PATH } from "@/lib/constants";
import { isSafeReturnTo } from "@/features/auth/paths";

/**
 * After sign-in, go back to where the user was, or to My tokens.
 *
 * There is no `role` on the GeekyKey Service's /me (agreement 8.4), so there is no
 * role-specific home to branch on. Agreement 13 says there are no GeekyKey admin screens,
 * so both roles land on My tokens.
 */
export function useGoAfterLogin() {
  const navigate = useNavigate();
  const router = useRouter();
  return useCallback(
    (returnTo: string | undefined) => {
      if (isSafeReturnTo(returnTo)) {
        // History, not the typed navigate: return_to is an arbitrary validated path rather than
        // one the router's types know, which is what isSafeReturnTo is for.
        router.history.replace(returnTo);
      } else {
        // Both roles land on My tokens: there are no GeekyKey admin screens (13).
        void navigate({ to: HOME_PATH, replace: true });
      }
    },
    [navigate, router],
  );
}
