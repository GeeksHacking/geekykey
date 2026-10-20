import { createFileRoute, Outlet } from "@tanstack/react-router";

import { ParticipantFrame } from "@/features/auth/participant-frame";
import { RequireSession } from "@/features/auth/require-session";

/** Pathless layout: every participant screen shares the session gate and the phone shell. */
export const Route = createFileRoute("/_app")({
  component: ParticipantLayout,
});

function ParticipantLayout() {
  return (
    <RequireSession>
      <ParticipantFrame>
        <Outlet />
      </ParticipantFrame>
    </RequireSession>
  );
}
