import type { ReactNode } from "react";

import { isApiErrorCode } from "@/api/errors";
import type { Role } from "@/api/types";
import { ForbiddenView } from "@/features/auth/forbidden-view";
import { useMe, useSession } from "@/lib/session";

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  if (me.user.role !== role || isApiErrorCode(session.authorizationError, "forbidden")) {
    return <ForbiddenView />;
  }
  return <>{children}</>;
}
