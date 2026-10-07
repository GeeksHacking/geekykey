import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RequireSession } from "@/features/auth/require-session";
import { SessionFrame } from "@/features/auth/session-frame";

/** Pathless layout: every signed-in screen shares the session gate and the shell. */
export const Route = createFileRoute("/_app")({
  component: SignedInLayout,
});

function SignedInLayout() {
  return (
    <RequireSession>
      <SessionFrame>
        <Outlet />
      </SessionFrame>
    </RequireSession>
  );
}
