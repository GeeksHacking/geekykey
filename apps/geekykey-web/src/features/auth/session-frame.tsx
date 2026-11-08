import { ArrowLeft } from "@phosphor-icons/react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EventLinkError } from "@/components/event-link-error";
import { useRouteHeadingFocus } from "@/lib/use-route-heading-focus";
import { describeError } from "@/api/errors";
import { GuestSignOutDialog } from "@/components/layout/guest-sign-out-dialog";
import { TokenHeader } from "@/components/layout/token-header";
import { COULD_NOT_CHECK_LOGIN, isGuest } from "@/features/auth/guest-check";
import { useReleaseMyTokens } from "@/features/auth/use-release-my-tokens";
import { EVENT_SCREENS_URL, HOME_PATH } from "@/lib/constants";
import { useMe, useSession } from "@/lib/session";
import { useLoginLink } from "@/lib/use-login-link";

/**
 * Joins the session to a signed-in screen, its navigation and the sign-out that
 * returns to /login. Route files stay one line.
 */
export function SessionFrame({ children }: { children: ReactNode }) {
  useRouteHeadingFocus();
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const release = useReleaseMyTokens();
  const openEvent = useLoginLink();
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
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <TokenHeader
        user={me.user}
        events={me.events}
        onSignOut={() => void chooseSignOut()}
        onEvent={(eventId) => openEvent.mutate(eventId)}
        eventLinkPending={openEvent.isPending || openEvent.isSuccess}
      />
      {openEvent.error ? (
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          <EventLinkError error={openEvent.error} />
        </div>
      ) : null}
      <GuestSignOutDialog
        open={warnedUserId === me.user.id}
        hasTokens={me.tokens.length > 0}
        isPending={release.isPending}
        isSigningOut={release.isPending}
        error={release.error}
        onStay={() => setWarnedUserId(null)}
        onSignOut={() => void releaseAndSignOut(me.user.id)}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16 outline-hidden"
      >
        {pathname.startsWith("/t/") ? (
          <Link
            to={HOME_PATH}
            className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm text-primary-text underline-offset-4 hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" />
            My tokens
          </Link>
        ) : null}
        {checkFailed ? (
          <p role="alert" className="pb-4 text-sm text-destructive">
            {COULD_NOT_CHECK_LOGIN}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
