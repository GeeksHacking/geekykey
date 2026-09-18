import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ParticipantShell } from "@/components/layout/participant-shell";
import { useMe, useSession } from "@/lib/session";

/** Joins the session to the participant shell. Route files stay one line. */
export function ParticipantFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();

  // A deliberate sign-out lands on a clean /login with no return_to. The next person at a
  // shared desk laptop should not be bounced into the previous user's page.
  async function signOut() {
    await session.signOut();
    await navigate({ to: "/login", replace: true });
  }

  return (
    <ParticipantShell user={me.user} onSignOut={() => void signOut()}>
      {children}
    </ParticipantShell>
  );
}
