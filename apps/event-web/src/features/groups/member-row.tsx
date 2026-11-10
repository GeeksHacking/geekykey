import { DotsSixVertical, DotsThree } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemberDrag } from "@/features/groups/member-drag";
import { useGroupBoardChange } from "@/features/groups/use-group-board";
import { cn } from "@/lib/utils";

/**
 * One person on the Groups screen, in a group or on the waiting list, with the organiser's
 * moves for them (the spec's user stories 30 to 35), from their menu or by dragging the row to
 * another place (FRO-140). A move may pass a group's capacity, and the panel then says it's over.
 * A move or removal that fails says why on the row.
 */
export function MemberRow({
  member,
  groupId,
  groups,
  tick,
}: {
  member: { user_id: string; display_name: string };
  /** Their group, or null while they wait. */
  groupId: string | null;
  /** Every group, oldest first, as the board lists them. */
  groups: { id: string; name: string }[];
  /** On the waiting list, a tick box to place them along with others (FRO-130). */
  tick?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  const change = useGroupBoardChange();
  const { busy, error } = change;
  const move = (to: string | null) =>
    change.mutate({ type: "move", userId: member.user_id, groupId: to });
  const { ref: dragRef, dragging } = useMemberDrag({ userId: member.user_id, busy, onMove: move });

  return (
    <li
      ref={dragRef}
      data-dragging={dragging || undefined}
      className={cn(
        "-mx-1 rounded-md px-1 select-none",
        !busy && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50 outline-2 outline-offset-1 outline-dashed outline-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1">
          <DotsSixVertical
            weight="bold"
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {tick ? (
            // The name labels the box, so a press on either ticks it.
            <label className="flex min-w-0 items-center gap-2 pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={tick.checked}
                disabled={busy}
                onChange={(event) => tick.onChange(event.target.checked)}
              />
              <span className="min-w-0 break-words">{member.display_name}</span>
            </label>
          ) : (
            <span className="min-w-0 break-words">{member.display_name}</span>
          )}
        </span>
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
