import { WarningCircle } from "@phosphor-icons/react";

import { describeError, isApiErrorCode, LOGIN_LINK_EXPIRED } from "@/api/errors";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Says why the login link this page arrived with did not log anyone in (agreement 7.4).
 * The session the browser had carries on underneath, so this sits above whatever screen
 * that session shows: the login, or the dashboard.
 */
export function LoginLinkNotice({ className }: { className?: string }) {
  const { loginLinkError } = useSession();
  if (loginLinkError === undefined) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm",
        className,
      )}
    >
      <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <span>{describeLoginLinkError(loginLinkError)}</span>
    </div>
  );
}

/**
 * A link the service could not read gets the expired link's sentence, because the person
 * can do the same about either: tap their token again.
 */
function describeLoginLinkError(error: unknown): string {
  return isApiErrorCode(error, "validation_failed") ? LOGIN_LINK_EXPIRED : describeError(error);
}
