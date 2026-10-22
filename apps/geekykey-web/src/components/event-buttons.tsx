import { describeError, isApiErrorCode } from "@/api/errors";
import type { EventServiceLink } from "@/api/types";
import { Button } from "@/components/ui/button";
import { useLoginLink } from "@/lib/use-login-link";

/*
  The event buttons (agreement 8.4): one for each event in /me, named after the event
  and opening that event's screens as the same user, through a login link (8.6).

  Lives in components/ so two features can host it, the token page's owner view and
  My tokens, the way release-token-block.tsx is shared.

  With no events there is nothing to show, so the screens carry on as they were.
*/
export function EventButtons({ events }: { events: EventServiceLink[] }) {
  const link = useLoginLink();

  if (events.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-3">
      {events.map((event) => (
        <Button
          key={event.id}
          // Disabled while the request is out, so a second press cannot ask for a
          // second link. The first one works once, and a second would not.
          disabled={link.isPending}
          onClick={() => link.mutate(event.id)}
        >
          Open {event.name}
        </Button>
      ))}
      {link.error ? <EventButtonError error={link.error} /> : null}
    </div>
  );
}

/**
 * What went wrong with one button's request. Section 13 fixes the sentence for
 * rate_limited, and describeError already gives it, so the rest of the failures are
 * worded the same way.
 */
function EventButtonError({ error }: { error: unknown }) {
  // A signed-out user is on their way to the login, as on any screen, so there is
  // nothing to say here.
  if (isApiErrorCode(error, "unauthenticated")) return null;

  // 8.6 answers not_found for an event_id that isn't in /me's events. The hook asks
  // /me again, so the button itself may be gone by the time this is read.
  if (isApiErrorCode(error, "not_found")) {
    return (
      <p role="alert" className="text-sm text-destructive">
        That event is no longer available.
      </p>
    );
  }

  return (
    <p role="alert" className="text-sm text-destructive">
      {describeError(error)}
    </p>
  );
}
