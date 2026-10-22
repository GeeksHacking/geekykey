import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { ParticipantShell } from "@/components/layout/participant-shell";
import { SessionErrorBanner } from "@/components/layout/session-error-banner";
import { LoginLinkNotice } from "@/features/auth/login-link-notice";
import { useMe, useSession } from "@/lib/session";

/** Joins the session to the participant shell. Route files stay one line. */
export function ParticipantFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();

  async function signOut() {
    try {
      await session.signOut();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      // The session provider has already cleared identity data; keep the failure visible without
      // leaving an unhandled promise rejection from the shell callback.
      toast.error(describeError(error));
    }
  }

  return (
    <ParticipantShell user={me.user} onSignOut={() => void signOut()}>
      <LoginLinkNotice className="mb-6" />
      {session.me && session.error ? (
        <SessionErrorBanner error={session.error} onRetry={() => void session.refresh()} />
      ) : null}
      {children}
    </ParticipantShell>
  );
}
