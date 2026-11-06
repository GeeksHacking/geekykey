import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { arrivedByLoginLink } from "@/lib/login-link-arrival";
import { useSession } from "@/lib/session";

/**
 * Every sign-out on these screens. Someone who logged in here goes to /login. Someone who arrived
 * by a login link may be a guest, which only the GeekyKey screens can tell, and only they can
 * release a guest's tokens (agreement section 3, FRO-131). So that person goes to their /sign-out
 * page, which warns a guest, and sends anyone else straight to this event's login. The fragment
 * says who signed out here, so that page leaves alone anyone else signed in there.
 *
 * `returnTo` is where the login goes next when the person stays on these screens.
 */
export function useSignOut(returnTo?: string) {
  const session = useSession();
  const navigate = useNavigate();

  return async function signOut() {
    const linkUserId = arrivedByLoginLink() ? session.me?.user.id : undefined;
    try {
      await session.signOut();
      if (linkUserId !== undefined) {
        window.location.assign(
          `${GEEKYKEY_SCREENS_URL}sign-out#user=${encodeURIComponent(linkUserId)}`,
        );
        return;
      }
      await navigate({ to: "/login", search: { return_to: returnTo }, replace: true });
    } catch (error) {
      // The session provider has already cleared identity data. Keep the failure visible, from
      // the Toaster above the routes, without an unhandled rejection from the menu callback.
      toast.error(describeError(error));
    }
  };
}
