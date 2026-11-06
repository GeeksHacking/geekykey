import {
  CalendarBlank,
  CaretDown,
  ListNumbers,
  SignOut,
  Stamp,
  UserCircle,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { EventServiceLink } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HOME_PATH } from "@/lib/constants";

interface AccountMenuProps {
  /** The user ID. The GeekyKey Service keeps no display name (agreement 8.4). */
  userId: string;
  isGeekyKeyAdmin: boolean;
  /** A GeekyKey admin or an organizer, from /me: they get a link to Token kinds. */
  canViewTokenKinds?: boolean;
  /** The events in /me, for the Event screens item. None hides it. */
  events?: EventServiceLink[];
  /** Opens the login link for one event (agreement 8.6). */
  onEvent?: (eventId: string) => void;
  /** A link is being made, so the Event items stay off. */
  eventLinkPending?: boolean;
  onSignOut: () => void;
}

/**
 * The account menu, reached from the shell. It shows the user ID rather than a name,
 * because the GeekyKey Service has no display name to show: /me returns
 * { id, is_geekykey_admin } and nothing else (agreement 8.4).
 */
export function AccountMenu({
  userId,
  isGeekyKeyAdmin,
  canViewTokenKinds = false,
  events = [],
  onEvent,
  eventLinkPending = false,
  onSignOut,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
          {/* The user ID and caret are hidden below `sm`, so the icon is the whole
              button on a phone. */}
          <UserCircle aria-hidden />
          <span className="hidden font-mono text-sm sm:inline">{userId}</span>
          <CaretDown className="hidden sm:inline" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-mono text-sm font-medium">{userId}</p>
          <p className="text-xs text-muted-foreground">
            {isGeekyKeyAdmin ? "GeekyKey admin" : "Participant"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={HOME_PATH}>
            <Stamp aria-hidden />
            My tokens
          </Link>
        </DropdownMenuItem>
        {events.length === 1 ? (
          <DropdownMenuItem disabled={eventLinkPending} onSelect={() => onEvent?.(events[0]!.id)}>
            <CalendarBlank aria-hidden />
            Event screens
          </DropdownMenuItem>
        ) : null}
        {events.length > 1 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={eventLinkPending}>
              <CalendarBlank aria-hidden />
              Event screens
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {events.map((event) => (
                <DropdownMenuItem
                  key={event.id}
                  disabled={eventLinkPending}
                  onSelect={() => onEvent?.(event.id)}
                >
                  {event.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {canViewTokenKinds ? (
          <DropdownMenuItem asChild>
            <Link to="/admin/token-kinds">
              <ListNumbers aria-hidden />
              Token kinds
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onSignOut}>
          <SignOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
