import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { HOME_PATH } from "@/lib/constants";
import { isSafeReturnTo } from "@/features/auth/paths";

/**
 * After sign-in, go back to where the user was, or to My tokens.
 *
 * There is no `role` on the GeekyKey Service's /me (agreement 8.4), so there is no
 * role-specific home to branch on. FRO-21 adds the admin console and the branch with it.
 */
export function useGoAfterLogin() {
  const navigate = useNavigate();
  const router = useRouter();
  return useCallback(
    (returnTo: string | undefined) => {
      if (isSafeReturnTo(returnTo)) {
        // History, not the typed navigate: return_to is an arbitrary validated path, and
        // /t/<UID> has no route yet, so the router has no type for it.
        router.history.replace(returnTo);
      } else {
        // The admin console arrives with FRO-21, so both roles land on My tokens for now.
        void navigate({ to: HOME_PATH, replace: true });
      }
    },
    [navigate, router],
  );
}
