import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { FullPageLoading } from "@/components/layout/full-page-loading";
import { useSession } from "@/lib/session";

/** Gate for any screen that needs a signed-in user. Sends anonymous visitors to /login and back again after. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const anonymous = session.status === "anonymous";

  // One navigation per anonymous visit, from an effect. A <Navigate /> element here would
  // re-run on every render with a fresh search object and keep the router busy forever.
  useEffect(() => {
    if (anonymous && !pathname.startsWith("/login")) {
      void navigate({ to: "/login", search: { return_to: pathname }, replace: true });
    }
  }, [anonymous, pathname, navigate]);

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
