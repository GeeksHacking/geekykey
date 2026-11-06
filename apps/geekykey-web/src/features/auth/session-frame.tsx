import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { AccountMenu } from "@/components/layout/account-menu";
import { GuestSignOutDialog } from "@/components/layout/guest-sign-out-dialog";
import { SiteSwitch } from "@/components/layout/site-switch";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { COULD_NOT_CHECK_LOGIN, isGuest } from "@/features/auth/guest-check";
import { useReleaseMyTokens } from "@/features/auth/use-release-my-tokens";
import { EVENT_SCREENS_URL } from "@/lib/constants";
import { useMe, useSession } from "@/lib/session";

/**
 * Joins the session to a signed-in screen: the account menu, and the sign-out that
 * returns to /login. Route files stay one line.
 */
export function SessionFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();
  const release = useReleaseMyTokens();
  // Who the warning is about. It closes if /me comes to name someone else while it's open.
  const [warnedUserId, setWarnedUserId] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  // A guest is warned first (agreement 13), and anyone else signs out straight away.
  async function chooseSignOut() {
    setCheckFailed(false);
    let guest: boolean;
    try {
      guest = await isGuest(me.user.id);
    } catch {
      setCheckFailed(true);
      return;
    }
    if (!guest) {
      await signOut();
      return;
    }
    release.reset();
    setWarnedUserId(me.user.id);
    // So the warning says the right thing about a token claimed in another tab.
    await session.refresh();
  }

  async function releaseAndSignOut(userId: string) {
    try {
      await release.mutateAsync(userId);
    } catch {
      return; // The dialog stays open and says why.
    }
    await signOut(userId);
  }

  /**
   * `guestId` sends a guest on to the Event screens, which end their session there too, so the next
   * person on a shared phone doesn't find their passport (agreement section 3, FRO-144).
   */
  async function signOut(guestId?: string) {
    try {
      await session.signOut();
      if (guestId !== undefined) {
        window.location.replace(`${EVENT_SCREENS_URL}sign-out#user=${encodeURIComponent(guestId)}`);
        return;
      }
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      // The provider has already cleared identity data; keep the failure visible without
      // leaving an unhandled rejection from the menu callback. It cannot be inline, because
      // by now the user is on /login, so it is a toast from the Toaster in routes/__root.tsx,
      // which stays mounted across that redirect.
      toast.error(describeError(error));
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-6">
      <header className="flex items-center justify-end gap-1 py-4">
        <SiteSwitch events={me.events} />
        <ThemeToggle />
        <AccountMenu
          userId={me.user.id}
          isGeekyKeyAdmin={me.user.is_geekykey_admin}
          canViewTokenKinds={me.user.can_view_token_kinds}
          onSignOut={() => void chooseSignOut()}
        />
        <GuestSignOutDialog
          open={warnedUserId === me.user.id}
          hasTokens={me.tokens.length > 0}
          isPending={release.isPending}
          isSigningOut={release.isPending}
          error={release.error}
          onStay={() => setWarnedUserId(null)}
          onSignOut={() => void releaseAndSignOut(me.user.id)}
        />
      </header>
      {checkFailed ? (
        <p role="alert" className="pb-4 text-sm text-destructive">
          {COULD_NOT_CHECK_LOGIN}
        </p>
      ) : null}
      <div className="flex-1 pb-16">{children}</div>
    </div>
  );
}
