import type { ReactNode } from "react";

import type { Role } from "@/api/types";
import { ForbiddenView } from "@/features/auth/forbidden-view";
import { useMe } from "@/lib/session";

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { me } = useMe();
  if (me.user.role !== role) return <ForbiddenView />;
  return <>{children}</>;
}
