import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { FullPageLoading } from "@/components/layout/full-page-loading";
import { isSafeReturnTo } from "@/features/auth/paths";
import { useSession } from "@/lib/session";

/** Gate for any screen that needs a signed-in user. Sends anonymous visitors to /login and back again after. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  const currentPath = useLocation({ select: (location) => location.href });
  const anonymous = session.status === "anonymous";

  // One navigation per anonymous visit, from an effect. A <Navigate /> element here would
  // re-run on every render with a fresh search object and keep the router busy forever.
  useEffect(() => {
    if (anonymous && isSafeReturnTo(currentPath)) {
      void navigate({ to: "/login", search: { return_to: currentPath }, replace: true });
    }
  }, [anonymous, currentPath, navigate]);

  if (session.status === "loading" || anonymous) return <FullPageLoading />;

  if (session.status === "error" && !session.me) {
    return (
      <div className="mx-auto max-w-md px-6 pt-24">
        <ErrorState
          error={session.error}
          onRetry={() => void session.refresh()}
          title="Could not load your account"
        />
      </div>
    );
  }

  return <>{children}</>;
}
