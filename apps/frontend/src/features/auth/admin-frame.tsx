import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/layout/admin-shell";
import { useMe, useSession } from "@/lib/session";

export function AdminFrame({ children }: { children: ReactNode }) {
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
    <AdminShell user={me.user} onSignOut={() => void signOut()}>
      {children}
    </AdminShell>
  );
}
