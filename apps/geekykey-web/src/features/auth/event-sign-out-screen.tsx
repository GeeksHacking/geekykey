import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { ErrorState } from "@/components/layout/error-state";
import { FullPageLoading } from "@/components/layout/full-page-loading";
import { GuestSignOutDialog } from "@/components/layout/guest-sign-out-dialog";
import { Button } from "@/components/ui/button";
import { COULD_NOT_CHECK_LOGIN, isGuestOrLinkArrival } from "@/features/auth/guest-check";
import { useReleaseMyTokens } from "@/features/auth/use-release-my-tokens";
import { EVENT_SCREENS_URL, HOME_PATH } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { useLoginLink } from "@/lib/use-login-link";

/** Back to the event's login, without leaving this page behind for Back to land on. */
function goToEventLogin() {
  window.location.replace(`${EVENT_SCREENS_URL}login`);
}

/**
 * Where the Event screens send someone who signed out after arriving by a login link (agreement
 * section 3, FRO-131). Those screens can't tell a guest or release a token, because the guest's
 * Firebase sign-in and gk_session belong to this hostname, so this page does both.
 *
 * The Event screens have logged them out by now, so whoever stays goes back through a login link
 * (8.6), and everyone else goes to the event's login. `userId` is who they were there. Anyone else
 * signed in here is left alone: the warning would be about the wrong person's tokens, and the
 * address alone can't ask for a sign-out.
 */
export function EventSignOutScreen({ userId }: { userId: string | null }) {
  const session = useSession();
  const navigate = useNavigate();
  const release = useReleaseMyTokens();
  const loginLink = useLoginLink();
  const [check, setCheck] = useState<"checking" | "guest" | "failed">("checking");

  const signedInAs = session.me?.user.id;
  const leaving =
    session.status === "anonymous" || (session.status === "authenticated" && signedInAs !== userId);

  useEffect(() => {
    if (leaving) {
      goToEventLogin();
      return;
    }
    if (session.status !== "authenticated" || check !== "checking" || !signedInAs) return;
    let current = true;
    isGuestOrLinkArrival(signedInAs).then(
      (guest) => {
        if (!current) return;
        if (guest) setCheck("guest");
        else goToEventLogin();
      },
      () => {
        if (current) setCheck("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [check, leaving, session.status, signedInAs]);

  async function releaseAndSignOut(guestId: string) {
    try {
      await release.mutateAsync(guestId);
    } catch {
      return; // The dialog stays open and says why.
    }
    try {
      // The session settles to nobody either way, which sends this page back to the event.
      await session.signOut();
    } catch (error) {
      // The tokens are released, and the page is leaving, so a message here couldn't be read.
      console.error("Signing out after releasing the tokens failed", error);
    }
  }

  async function stay() {
    const event = session.me?.events[0];
    try {
      if (event) {
        await loginLink.mutateAsync(event.id);
        return;
      }
    } catch (error) {
      toast.error(describeError(error));
    }
    await navigate({ to: HOME_PATH, replace: true });
  }

  if (session.status === "error") {
    return (
      <CheckFailed>
        <ErrorState error={session.error} onRetry={() => void session.refresh()} />
      </CheckFailed>
    );
  }

  if (check === "failed" && !leaving) {
    return (
      <CheckFailed>
        <ErrorState
          error={undefined}
          title={COULD_NOT_CHECK_LOGIN}
          description={null}
          onRetry={() => setCheck("checking")}
        />
      </CheckFailed>
    );
  }

  if (check !== "guest" || !session.me) return <FullPageLoading />;
  const warnedUserId = session.me.user.id;

  return (
    <GuestSignOutDialog
      open
      hasTokens={session.me.tokens.length > 0}
      // A link that opened has this page leaving, which still counts as working.
      isPending={release.isPending || loginLink.isPending || loginLink.isSuccess}
      isSigningOut={release.isPending}
      error={release.error}
      onStay={() => void stay()}
      onSignOut={() => void releaseAndSignOut(warnedUserId)}
    />
  );
}

/**
 * The person is already logged out of the event, and whatever went wrong here may not clear, so
 * going back is always on offer. Nothing has been released, and a GeekyKey admin can still do that.
 */
function CheckFailed({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 pt-24">
      <div className="w-full">{children}</div>
      <Button variant="ghost" onClick={goToEventLogin}>
        Back to the event
      </Button>
    </div>
  );
}
