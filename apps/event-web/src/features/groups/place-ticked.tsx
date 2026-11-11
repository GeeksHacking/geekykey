import { describeError } from "@/api/errors";
import type { GroupWaitingMember } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlacementsFailed, useGroupBoardChange } from "@/features/groups/use-group-board";

/**
 * Moves everyone ticked on the waiting list to one group with one press (FRO-130). Each person is
 * placed as their own menu's Move to places them, so the group may pass its capacity. Anyone who
 * wasn't placed is named with the reason, until the next press, and stays ticked: a tick goes
 * only when its person leaves the list.
 */
export function PlaceTicked({
  ticked,
  waiting,
  groups,
}: {
  /** Who is ticked and still waiting, in the list's order. */
  ticked: GroupWaitingMember[];
  /** Everyone waiting, to name those who weren't placed. */
  waiting: GroupWaitingMember[];
  /** Every group, oldest first, as the board lists them. */
  groups: { id: string; name: string }[];
}) {
  const change = useGroupBoardChange();
  const { busy, error } = change;
  const place = (groupId: string) =>
    change.mutate({ type: "place", userIds: ticked.map(({ user_id }) => user_id), groupId });

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {groups.length === 0
            ? "Make a group to move people to."
            : ticked.length === 0
              ? "Tick people to move them to a group together."
              : `${ticked.length} ticked`}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || ticked.length === 0 || groups.length === 0}
            >
              Move ticked
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {groups.map((group) => (
              <DropdownMenuItem disabled={busy} key={group.id} onSelect={() => place(group.id)}>
                Move to {group.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? <PlaceError error={error} waiting={waiting} /> : null}
    </div>
  );
}

/**
 * Who wasn't placed and why, one sentence for each reason. Someone who has left the waiting
 * list since is no longer named.
 */
function PlaceError({ error, waiting }: { error: unknown; waiting: GroupWaitingMember[] }) {
  if (!(error instanceof PlacementsFailed)) {
    return (
      <p role="alert" className="text-xs text-destructive-text">
        {describeError(error)}
      </p>
    );
  }
  const namesByReason = new Map<string, string[]>();
  for (const { userId, error: cause } of error.failed) {
    const member = waiting.find(({ user_id }) => user_id === userId);
    if (!member) continue;
    const reason = describeError(cause);
    namesByReason.set(reason, [...(namesByReason.get(reason) ?? []), member.display_name]);
  }
  if (namesByReason.size === 0) return null;
  return (
    <div role="alert" className="space-y-1 text-xs text-destructive-text">
      {[...namesByReason].map(([reason, names]) => (
        <p key={reason}>
          Not placed: {names.join(", ")}. {reason}
        </p>
      ))}
    </div>
  );
}
