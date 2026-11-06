import type { ReactNode } from "react";

import { AdminShell } from "@/components/layout/admin-shell";
import { SessionErrorBanner } from "@/components/layout/session-error-banner";
import { useMe, useSession } from "@/lib/session";
import { useSignOut } from "@/lib/use-sign-out";

export function AdminFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const signOut = useSignOut();

  return (
    <AdminShell user={me.user} onSignOut={() => void signOut()}>
      {session.me && session.error ? (
        <SessionErrorBanner error={session.error} onRetry={() => void session.refresh()} />
      ) : null}
      {children}
    </AdminShell>
  );
}
