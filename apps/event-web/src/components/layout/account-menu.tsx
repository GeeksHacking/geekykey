import { Broadcast, CaretDown, SignOut, Stamp } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { User } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountMenuProps {
  user: User;
  onSignOut: () => void;
  /** Which other surface to offer a link to. Organisers can move between both. */
  consoleLink?: "admin" | "participant";
}

function initialsOf(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function AccountMenu({ user, onSignOut, consoleLink }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          A display name can be 30 characters (agreement 8.7), and both callers put this button in
          a row with less room than a long name asks for. The button gives way first: min-w-0 here
          and on each flex parent, then the name truncates. The dropdown below has the whole name.
        */}
        <Button variant="ghost" className="min-w-0 gap-2 px-2" aria-label="Account menu">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-secondary font-mono text-xs font-semibold text-secondary-foreground">
            {initialsOf(user.display_name)}
          </span>
          <span className="hidden min-w-0 truncate text-sm sm:block">
            {user.display_name ?? "Participant"}
          </span>
          <CaretDown className="hidden sm:inline" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{user.display_name ?? "Participant"}</p>
          <p className="text-xs text-muted-foreground">
            {user.role === "organizer" ? "Organiser" : "Participant"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {consoleLink === "admin" ? (
          <DropdownMenuItem asChild>
            <Link to="/admin/stations">
              <Broadcast aria-hidden />
              Organiser console
            </Link>
          </DropdownMenuItem>
        ) : null}
        {consoleLink === "participant" ? (
          <DropdownMenuItem asChild>
            <Link to="/">
              <Stamp aria-hidden />
              Participant view
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
