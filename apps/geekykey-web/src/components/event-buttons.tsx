import { describeError, isApiErrorCode } from "@/api/errors";
import type { EventServiceLink } from "@/api/types";
import { Button } from "@/components/ui/button";
import { useLoginLink } from "@/lib/use-login-link";
import { cn } from "@/lib/utils";

/*
  The event buttons (agreement 8.4): one for each event in /me, named after the event
  and opening that event's screens as the same user, through a login link (8.6).

  Lives in components/ so two features can host it, the token page's owner view and
  My tokens, the way release-token-block.tsx is shared.

  With no events there is nothing to show, so the screens carry on as they were.
*/
export function EventButtons({
  events,
  className,
}: {
  events: EventServiceLink[];
  /** The space the screen wants around the buttons. Nothing renders without events. */
  className?: string;
}) {
  const openEvent = useLoginLink();

  if (events.length === 0) return null;

  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      {events.map((event) => (
        <Button
          key={event.id}
          // Disabled while the request is out, and after it, while the page leaves for
          // the link, so a second press cannot ask for a second link.
          disabled={openEvent.isPending || openEvent.isSuccess}
          onClick={() => openEvent.mutate(event.id)}
        >
          Open {event.name}
        </Button>
      ))}
      {openEvent.error ? <EventButtonError error={openEvent.error} /> : null}
    </div>
  );
}

/**
 * What went wrong with one button's request. Section 13 fixes the sentence for
 * rate_limited, and describeError already gives it, so the rest of the failures are
 * worded the same way, apart from the two that need no sentence.
 */
function EventButtonError({ error }: { error: unknown }) {
  // A signed-out user is on their way to the login, as on any screen, so there is
  // nothing to say here.
  if (isApiErrorCode(error, "unauthenticated")) return null;

  // 8.6 answers not_found for an event_id that isn't in /me's events. The hook asks
  // /me again, and the fresh events decide which buttons there are. Section 13 sets
  // no sentence for it, so there is nothing to say.
  if (isApiErrorCode(error, "not_found")) return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      {describeError(error)}
    </p>
  );
}
