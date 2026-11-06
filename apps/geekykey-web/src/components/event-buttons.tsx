import type { EventServiceLink } from "@/api/types";
import { EventLinkError } from "@/components/event-link-error";
import { Button } from "@/components/ui/button";
import { useLoginLink } from "@/lib/use-login-link";
import { cn } from "@/lib/utils";

/*
  The event buttons (agreement 8.4): one for each event in /me, named after the event
  and opening that event's screens as the same user, through a login link (8.6).

  Lives in components/ so two features can host it, the token page's owner view and
  My tokens, the way release-token-block.tsx is shared.

  The token page names its token, so the link carries that token's kind (11.9). My
  tokens sends none, because it shows several tokens and no single one made the link.

  With no events there is nothing to show, so the screens carry on as they were.
*/
export function EventButtons({
  events,
  uid,
  className,
}: {
  events: EventServiceLink[];
  /** The token whose page these buttons are on (8.6). My tokens sends none. */
  uid?: string;
  /** The space the screen wants around the buttons. Nothing renders without events. */
  className?: string;
}) {
  const openEvent = useLoginLink(uid);

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
      {openEvent.error ? <EventLinkError error={openEvent.error} /> : null}
    </div>
  );
}
