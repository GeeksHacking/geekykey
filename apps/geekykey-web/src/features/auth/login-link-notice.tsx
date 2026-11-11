import { WarningCircle } from "@phosphor-icons/react";

import { LOGIN_LINK_FAILED } from "@/api/errors";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Says why the login link this page arrived with from the Event screens' My tokens did not log
 * anyone in (agreement 7.5, BAC-157). The session the browser had carries on underneath, so this
 * sits above whatever screen that session shows: the login, or the user's own pages.
 *
 * Every failure gets the one sentence, as on the Event screens (their login-link-notice.tsx):
 * the link is out of the address and works once, so trying again cannot help, and opening My
 * tokens from the event again makes a new one.
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
      <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-text" aria-hidden />
      <span>{LOGIN_LINK_FAILED}</span>
    </div>
  );
}
