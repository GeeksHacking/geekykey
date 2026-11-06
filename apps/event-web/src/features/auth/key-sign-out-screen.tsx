import { useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { FullPageLoading } from "@/components/layout/full-page-loading";
import { Button } from "@/components/ui/button";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { useSession } from "@/lib/session";

/** Back to the GeekyKey login, without leaving this page behind for Back to land on. */
function goToKeyLogin() {
  window.location.replace(`${GEEKYKEY_SCREENS_URL}login`);
}

/**
 * Where the GeekyKey screens send a guest who signed out there (agreement section 3, FRO-144), so
 * the next person on a shared phone doesn't find their passport. event_session belongs to this
 * hostname, so only this page can end it.
 *
 * `userId` is who signed out. Anyone else logged in here is left alone: the logout is a page load
 * that any link could cause, and SameSite=Lax can't tell, so naming the user is what stops a link
 * from logging someone out.
 */
export function KeySignOutScreen({ userId }: { userId: string | null }) {
  const session = useSession();
  const [failure, setFailure] = useState<unknown>();
  const decided = useRef(false);

  const { signOut } = session;

  const signedInAs = session.me?.user.id;
  useEffect(() => {
    // Decided once, from the first answer. A failed logout settles the session to nobody as well,
    // and that mustn't read as nobody having been logged in.
    if (decided.current || session.status === "loading" || session.status === "error") return;
    decided.current = true;
    if (session.status === "authenticated" && signedInAs === userId) {
      signOut().then(goToKeyLogin, (error: unknown) => setFailure(error));
    } else {
      goToKeyLogin();
    }
  }, [session.status, signedInAs, signOut, userId]);

  if (session.status === "error" || failure) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 pt-24">
        <div className="w-full">
          {failure ? (
            <ErrorState
              error={failure}
              title="Couldn't log you out of the event"
              onRetry={() => {
                setFailure(undefined);
                signOut().then(goToKeyLogin, (error: unknown) => setFailure(error));
              }}
            />
          ) : (
            <ErrorState error={session.error} onRetry={() => void session.refresh()} />
          )}
        </div>
        <Button variant="ghost" onClick={goToKeyLogin}>
          Back to GeekyKey
        </Button>
      </div>
    );
  }

  return <FullPageLoading />;
}
