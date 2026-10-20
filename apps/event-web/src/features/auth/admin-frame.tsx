import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { AdminShell } from "@/components/layout/admin-shell";
import { SessionErrorBanner } from "@/components/layout/session-error-banner";
import { useMe, useSession } from "@/lib/session";

export function AdminFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();

  async function signOut() {
    try {
      await session.signOut();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      // Identity data is cleared before the request; report a failed cookie clear without an
      // unhandled rejection from the account menu.
      toast.error(describeError(error));
    }
  }

  return (
    <AdminShell user={me.user} onSignOut={() => void signOut()}>
      {session.me && session.error ? (
        <SessionErrorBanner error={session.error} onRetry={() => void session.refresh()} />
      ) : null}
      {children}
    </AdminShell>
  );
}
