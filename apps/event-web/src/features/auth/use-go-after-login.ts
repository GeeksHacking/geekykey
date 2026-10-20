import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import type { Role } from "@/api/types";
import { homePathFor, isSafeReturnTo } from "@/features/auth/paths";

/**
 * After sign-in, go back to where the user was, or to their role's home.
 * return_to is an arbitrary validated path, so it goes through history rather
 * than the typed navigate, which only knows the routes in the tree.
 */
export function useGoAfterLogin() {
  const navigate = useNavigate();
  const router = useRouter();
  return useCallback(
    (returnTo: string | undefined, role: Role) => {
      if (isSafeReturnTo(returnTo) && returnTo !== "/login") {
        router.history.replace(returnTo);
      } else {
        void navigate({ to: homePathFor(role), replace: true });
      }
    },
    [navigate, router],
  );
}
