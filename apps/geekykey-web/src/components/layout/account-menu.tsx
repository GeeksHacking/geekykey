import { CaretDown, SignOut, UserCircle } from "@phosphor-icons/react";

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
  /** The GeekyKey Service keeps no display name (agreement 8.4). */
  userId: string;
  isGeekyKeyAdmin: boolean;
  onSignOut: () => void;
}

export function AccountMenu({ userId, isGeekyKeyAdmin, onSignOut }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="shrink-0 gap-2 px-2" aria-label="Account menu">
          <UserCircle aria-hidden />
          <span>Account</span>
          <CaretDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="break-all font-mono text-xs font-medium">{userId}</p>
          {isGeekyKeyAdmin ? <p className="text-xs text-muted-foreground">GeekyKey admin</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={onSignOut}>
          <SignOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
