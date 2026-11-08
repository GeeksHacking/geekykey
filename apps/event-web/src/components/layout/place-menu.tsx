import { CalendarBlank, CaretDown, Check, Key, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

interface PlaceMenuProps {
  place: "event" | "organiser";
  isOrganiser: boolean;
}

/** Switching places lives above page navigation, separate from the account menu. */
export function PlaceMenu({ place, isOrganiser }: PlaceMenuProps) {
  const label = place === "event" ? "Event screens" : "Organiser console";
  const Icon = place === "event" ? CalendarBlank : SlidersHorizontal;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="max-w-full gap-2 px-3"
          aria-label={`Switch place, ${label}`}
        >
          <Icon aria-hidden />
          <span className="truncate">{label}</span>
          <CaretDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Go to</DropdownMenuLabel>
        <DropdownMenuItem asChild className="min-h-11">
          <a href={GEEKYKEY_SCREENS_URL}>
            <Key aria-hidden />
            My tokens
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11">
          <Link to="/" aria-current={place === "event" ? "location" : undefined}>
            <CalendarBlank aria-hidden />
            Event screens
            {place === "event" ? <Check className="ml-auto" aria-hidden /> : null}
          </Link>
        </DropdownMenuItem>
        {isOrganiser ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Manage event</DropdownMenuLabel>
            <DropdownMenuItem asChild className="min-h-11">
              <Link
                to="/admin/stations"
                aria-current={place === "organiser" ? "location" : undefined}
              >
                <SlidersHorizontal aria-hidden />
                Organiser console
                {place === "organiser" ? <Check className="ml-auto" aria-hidden /> : null}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
