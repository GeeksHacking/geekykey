import { CaretDown, SignOut, Stamp } from "@phosphor-icons/react";
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
import { HOME_PATH } from "@/lib/constants";

interface AccountMenuProps {
  /** The user ID. The GeekyKey Service keeps no display name (agreement 8.4). */
  userId: string;
  isGeekyKeyAdmin: boolean;
  onSignOut: () => void;
}

/**
 * The account menu, reached from the shell. It shows the user ID rather than a name,
 * because the GeekyKey Service has no display name to show: /me returns
 * { id, is_geekykey_admin } and nothing else (agreement 8.4).
 */
export function AccountMenu({ userId, isGeekyKeyAdmin, onSignOut }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
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
        <DropdownMenuItem onSelect={onSignOut}>
          <SignOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
