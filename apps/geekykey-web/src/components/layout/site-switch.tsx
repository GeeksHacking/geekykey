import { CaretDown } from "@phosphor-icons/react";

import type { EventServiceLink } from "@/api/types";
import { EventLinkError } from "@/components/event-link-error";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLoginLink } from "@/lib/use-login-link";
import { cn } from "@/lib/utils";

/*
  FRO-141. The key screens' way back to the event screens, which must be a login link
  (agreement 8.6), not a plain link: a guest who followed a plain link would land on the
  event login, which offers no guest option (agreement 3). The current site is plain text
  with aria-current. One event is a direct button; several open a menu, because one
  segment cannot say which event to open. No events hides the switch.
*/
const SEGMENT =
  "flex h-auto shrink-0 items-center whitespace-nowrap rounded-md px-1 py-1.5 text-xs font-medium";
const CURRENT = "bg-primary text-primary-foreground inset-ring inset-ring-primary-edge";
const OTHER =
  "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:inset-ring hover:inset-ring-border";

export function SiteSwitch({
  events,
  className,
}: {
  events: EventServiceLink[];
  className?: string;
}) {
  const openEvent = useLoginLink();

  if (events.length === 0) return null;

  // A link works once and the page leaves for it, so the control stays off until then.
  const busy = openEvent.isPending || openEvent.isSuccess;

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <nav aria-label="Sites" className="flex items-center">
        <span className={cn(SEGMENT, CURRENT)} aria-current="page">
          Key
        </span>
        {events.length === 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(SEGMENT, OTHER)}
            disabled={busy}
            onClick={() => openEvent.mutate(events[0]!.id)}
          >
            Event
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(SEGMENT, OTHER)}
                disabled={busy}
              >
                Event
                <CaretDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {events.map((event) => (
                <DropdownMenuItem
                  key={event.id}
                  disabled={busy}
                  onSelect={() => openEvent.mutate(event.id)}
                >
                  {event.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
      {openEvent.error ? <EventLinkError error={openEvent.error} /> : null}
    </div>
  );
}
