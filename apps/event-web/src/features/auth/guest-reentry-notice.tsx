import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The way back for a guest who opened the Event screens directly (FRO-90, agreement section 13).
 * Firebase keeps a sign-in per hostname, so a guest signed in on the GeekyKey screens has no
 * session here, and the event button there is the only way in. The login has no session, so it
 * cannot tell a guest from anyone else, and the question form lets everyone else ignore it.
 */
export function GuestReentryNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Signed in as a guest?{" "}
      <a className="text-primary-text underline underline-offset-4" href={GEEKYKEY_SCREENS_URL}>
        Open GeekyKey
      </a>{" "}
      and tap your event button.
    </p>
  );
}
