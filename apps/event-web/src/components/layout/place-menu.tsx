import { CalendarBlank, CaretDown, Key, SlidersHorizontal } from "@phosphor-icons/react";
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
import { useOpenMyTokens } from "@/lib/use-open-my-tokens";

// Keep the current place yellow when pointer or keyboard focus moves to another row.
const CURRENT_ITEM =
  "min-h-11 data-[current=true]:bg-primary data-[current=true]:text-primary-foreground data-[current=true]:inset-ring data-[current=true]:inset-ring-primary-edge data-[current=true]:focus:bg-primary data-[current=true]:focus:text-primary-foreground data-[current=true]:focus-visible:outline data-[current=true]:focus-visible:outline-2 data-[current=true]:focus-visible:outline-offset-2 data-[current=true]:focus-visible:outline-ring";

interface PlaceMenuProps {
  place: "event" | "organiser";
  isOrganiser: boolean;
}

/** Switching places lives above page navigation, separate from the account menu. */
export function PlaceMenu({ place, isOrganiser }: PlaceMenuProps) {
  const label = place === "event" ? "Event screens" : "Organiser console";
  const Icon = place === "event" ? CalendarBlank : SlidersHorizontal;
  const openMyTokens = useOpenMyTokens();

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
      <DropdownMenuContent
        align="start"
        className="w-64 max-w-[calc(100vw-2rem)] [&_[role=menuitem]]:transition-none"
      >
        <DropdownMenuLabel>Go to</DropdownMenuLabel>
        <DropdownMenuItem asChild className="min-h-11">
          <a
            href={GEEKYKEY_SCREENS_URL}
            aria-disabled={openMyTokens.isPending || undefined}
            onClick={(event) => {
              // A new tab or window keeps the plain address, where the usual login takes over.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              if (!openMyTokens.isPending) openMyTokens.mutate();
            }}
          >
            <Key aria-hidden />
            My tokens
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-current={place === "event"} className={CURRENT_ITEM}>
          <Link to="/" aria-current={place === "event" ? "location" : undefined}>
            <CalendarBlank aria-hidden />
            Event screens
          </Link>
        </DropdownMenuItem>
        {isOrganiser ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Manage event</DropdownMenuLabel>
            <DropdownMenuItem asChild data-current={place === "organiser"} className={CURRENT_ITEM}>
              <Link
                to="/admin/stations"
                aria-current={place === "organiser" ? "location" : undefined}
              >
                <SlidersHorizontal aria-hidden />
                Organiser console
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
