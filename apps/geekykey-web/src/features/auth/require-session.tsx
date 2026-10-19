import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import { describeError, isApiErrorCode } from "@/api/errors";
import { ErrorState } from "@/components/layout/error-state";
import { FullPageLoading } from "@/components/layout/full-page-loading";
import { useSession } from "@/lib/session";

/**
 * Gate for any screen that needs a signed-in user. Sends anonymous visitors to /login and
 * back again after.
 *
 * The token page depends on the return: it logs in with `return_to=/t/<UID>` so the user
 * lands back on the token they tapped (agreement 7.2). The /login route validates that
 * value with isSafeReturnTo before anything navigates with it.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  // Only the href string, so the effect's dependency is a primitive. Selecting the whole
  // location object returns a fresh reference each render and re-fires the effect.
  const currentPath = useRouterState({ select: (state) => state.location.href });
  const anonymous = session.status === "anonymous";

  // One navigation per anonymous visit, from an effect. A <Navigate /> element here would
  // re-run on every render with a fresh search object and keep the router busy forever.
  const redirected = useRef(false);
  useEffect(() => {
    if (!anonymous) {
      redirected.current = false;
      return;
    }
    if (redirected.current) return;
    redirected.current = true;
    // The router's own location, not window.location: in a memory-history test, and in any
    // deployment where the app is not served from the origin root, the two can differ.
    void navigate({ to: "/login", search: { return_to: currentPath }, replace: true });
  }, [anonymous, currentPath, navigate]);

  if (session.status === "loading" || anonymous) return <FullPageLoading />;

  if (session.status === "error" && !session.me) {
    const title = titleFor(session.error);
    return (
      <div className="mx-auto max-w-md px-6 pt-24">
        <ErrorState
          error={session.error}
          onRetry={() => void session.refresh()}
          title={title ?? "Could not load your account"}
          description={title ? null : undefined}
        />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Wording agreement section 13 fixes for the token page, the claim form and My tokens,
 * given as the whole message. A failed /me shows here for every screen the gate serves,
 * so the sentence is the title and ErrorState's description stays empty instead of the
 * same words appearing twice. Every other failure keeps the generic title, with
 * describeError beneath it.
 */
function titleFor(error: unknown): string | undefined {
  if (isApiErrorCode(error, "claims_unavailable") || isApiErrorCode(error, "rate_limited")) {
    return describeError(error);
  }
  return undefined;
}
