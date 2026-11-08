import { CalendarBlank, CaretDown, Key, SpinnerGap } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { EventServiceLink } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Keep the current place yellow when pointer or keyboard focus moves to another row.
const CURRENT_ITEM =
  "min-h-11 data-[current=true]:bg-primary data-[current=true]:text-primary-foreground data-[current=true]:inset-ring data-[current=true]:inset-ring-primary-edge data-[current=true]:focus:bg-primary data-[current=true]:focus:text-primary-foreground data-[current=true]:focus-visible:outline data-[current=true]:focus-visible:outline-2 data-[current=true]:focus-visible:outline-offset-2 data-[current=true]:focus-visible:outline-ring";

interface PlaceMenuProps {
  events: EventServiceLink[];
  onEvent: (eventId: string) => void;
  eventLinkPending: boolean;
}

/** Event destinations use login links; an ordinary URL would lose the guest's identity. */
export function PlaceMenu({ events, onEvent, eventLinkPending }: PlaceMenuProps) {
  if (events.length === 0) {
    return (
      <span className="flex h-10 items-center gap-2 px-3 text-sm font-medium">
        <Key aria-hidden className="size-4" />
        My tokens
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 px-3"
          aria-label={eventLinkPending ? "Opening event" : "Switch place, My tokens"}
          aria-busy={eventLinkPending}
        >
          {eventLinkPending ? (
            <SpinnerGap className="motion-safe:animate-spin" aria-hidden />
          ) : (
            <Key aria-hidden />
          )}
          <span>{eventLinkPending ? "Opening event" : "My tokens"}</span>
          <CaretDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <span role="status" className="sr-only">
        {eventLinkPending ? "Opening event" : ""}
      </span>
      <DropdownMenuContent
        align="start"
        className="w-64 max-w-[calc(100vw-2rem)] [&_[role=menuitem]]:transition-none"
      >
        <DropdownMenuLabel>Go to</DropdownMenuLabel>
        <DropdownMenuItem asChild data-current="true" className={CURRENT_ITEM}>
          <Link to="/" aria-current="location">
            <Key aria-hidden />
            My tokens
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Event screens</DropdownMenuLabel>
        {events.map((event) => (
          <DropdownMenuItem
            key={event.id}
            className="min-h-11"
            disabled={eventLinkPending}
            onSelect={() => onEvent(event.id)}
          >
            <CalendarBlank aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">{event.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
