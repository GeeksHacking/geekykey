import { CalendarBlank, CaretDown, Check, Key, SpinnerGap } from "@phosphor-icons/react";
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
      <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Go to</DropdownMenuLabel>
        <DropdownMenuItem asChild className="min-h-11">
          <Link to="/" aria-current="location">
            <Key aria-hidden />
            My tokens
            <Check className="ml-auto" aria-hidden />
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
