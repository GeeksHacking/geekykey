import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminFrame } from "@/features/auth/admin-frame";
import { RequireRole } from "@/features/auth/require-role";
import { RequireSession } from "@/features/auth/require-session";

/** Organiser console layout. A participant session renders the 403 view here, in place. */
export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <RequireSession>
      <RequireRole role="organizer">
        <AdminFrame>
          <Outlet />
        </AdminFrame>
      </RequireRole>
    </RequireSession>
  );
}
