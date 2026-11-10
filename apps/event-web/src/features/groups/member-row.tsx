import { DotsSixVertical, DotsThree } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import type { GroupPlacedHow } from "@/api/types";
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
import { formatTimeWithSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How someone came to be in their group, in words (spec story 39). New wording, listed for
 * section 13 of agreement 0.14. "Moved by an organiser" rather than a bare "Organiser", which
 * beside a name would read as the person's role.
 */
const PLACED_HOW: Record<GroupPlacedHow, string> = {
  allocated: "Allocated",
  latecomer: "Latecomer",
  organizer: "Moved by an organiser",
};

/** A person as a row shows them. A group's member also has when and how they were placed. */
interface MemberRowPerson {
  user_id: string;
  display_name: string;
  joined_at: string;
  placed_at?: string;
  how?: GroupPlacedHow;
}

/**
 * One person on the Groups screen, in a group or on the waiting list, with the organiser's
 * moves for them (the spec's user stories 30 to 35), from their menu or, with a mouse, by
 * dragging the row to another place (FRO-140). A move may pass a group's capacity, and the panel
 * then says it's over. A move or removal that fails says why on the row.
 *
 * Their join time shows, and in a group their placement time and how they were placed, so the
 * report can measure time to group (FRO-124, spec story 39).
 */
export function MemberRow({
  member,
  groupId,
  groups,
  tick,
}: {
  member: MemberRowPerson;
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
        // A phone can't drag (member-drag.ts), so it keeps names selectable and shows no grip.
        "-mx-1 rounded-md px-1 select-none pointer-coarse:select-auto",
        !busy && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50 outline-2 outline-offset-1 outline-dashed outline-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <DotsSixVertical
              weight="bold"
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground pointer-coarse:hidden"
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
          </div>
          <MemberTimes member={member} />
        </div>
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

/**
 * When they joined, and in a group when they were placed and how (FRO-124). The seconds matter,
 * since a trial runs for minutes. The times sit under the name, out of the tick box's label, so
 * a press on one never ticks the box. A gap rather than a dot between the parts, because the
 * line wraps at 360 px and a dot would be left dangling at the end of a line. The indent lines
 * the times up with the name beside the grip, and goes on a phone, where the grip is hidden.
 */
function MemberTimes({ member }: { member: MemberRowPerson }) {
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-3 pl-[1.125rem] text-xs text-muted-foreground pointer-coarse:pl-0">
      <span>
        Joined{" "}
        <time dateTime={member.joined_at} className="font-mono">
          {formatTimeWithSeconds(member.joined_at)}
        </time>
      </span>
      {member.placed_at ? (
        <span>
          Placed{" "}
          <time dateTime={member.placed_at} className="font-mono">
            {formatTimeWithSeconds(member.placed_at)}
          </time>
        </span>
      ) : null}
      {member.how ? <span>{PLACED_HOW[member.how]}</span> : null}
    </p>
  );
}
