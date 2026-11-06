import { DotsThree } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGroupBoardChange } from "@/features/groups/use-group-board";

/**
 * One person on the Groups screen, in a group or on the waiting list, with the organiser's
 * moves for them (the spec's user stories 30 to 35). A move may pass a group's capacity, and the
 * panel then says it's over. A move or removal that fails says why on the row.
 */
export function MemberRow({
  member,
  groupId,
  groups,
}: {
  member: { user_id: string; display_name: string };
  /** Their group, or null while they wait. */
  groupId: string | null;
  /** Every group, oldest first, as the board lists them. */
  groups: { id: string; name: string }[];
}) {
  const change = useGroupBoardChange();
  const { busy, error } = change;
  const move = (to: string | null) =>
    change.mutate({ type: "move", userId: member.user_id, groupId: to });

  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words">{member.display_name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground pointer-coarse:size-11"
              aria-label={`Actions for ${member.display_name}`}
              disabled={busy}
            >
              <DotsThree weight="bold" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {groups
              .filter(({ id }) => id !== groupId)
              .map((group) => (
                <DropdownMenuItem disabled={busy} key={group.id} onSelect={() => move(group.id)}>
                  Move to {group.name}
                </DropdownMenuItem>
              ))}
            {groupId !== null ? (
              <DropdownMenuItem disabled={busy} onSelect={() => move(null)}>
                Send back to waiting
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {/* For someone who has left, so they stop counting toward a group's size. They
                can join again. */}
            <DropdownMenuItem
              disabled={busy}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => change.mutate({ type: "remove", userId: member.user_id })}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {describeError(error)}
        </p>
      ) : null}
    </li>
  );
}
