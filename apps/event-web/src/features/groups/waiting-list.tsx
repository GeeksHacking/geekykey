import { useState } from "react";

import type { GroupWaitingMember } from "@/api/types";
import { DROP_OVER, usePlaceDrop } from "@/features/groups/member-drag";
import { MemberRow } from "@/features/groups/member-row";
import { PlaceTicked } from "@/features/groups/place-ticked";
import { cn } from "@/lib/utils";

/**
 * Everyone who has joined and has no group, with their menus. Someone dragged here from a group
 * goes back to waiting (FRO-140). Several can be ticked and put in one group together (FRO-130).
 */
export function WaitingList({
  waiting,
  groups,
}: {
  waiting: GroupWaitingMember[];
  /** Every group, oldest first, as the board lists them. */
  groups: { id: string; name: string }[];
}) {
  const { ref: dropRef, over } = usePlaceDrop({
    place: null,
    memberIds: waiting.map(({ user_id }) => user_id),
  });
  const [tickedIds, setTickedIds] = useState<string[]>([]);
  const ticked = waiting.filter(({ user_id }) => tickedIds.includes(user_id));
  // A tick goes when its person leaves the list, placed or removed, so they aren't still ticked
  // if they come back. Dropped while rendering, as React allows for state that follows props.
  if (ticked.length !== tickedIds.length) setTickedIds(ticked.map(({ user_id }) => user_id));
  return (
    <section
      ref={dropRef}
      aria-labelledby="groups-waiting"
      data-drop-over={over || undefined}
      className={cn("rounded-lg border p-4", DROP_OVER)}
    >
      <h2 id="groups-waiting" className="type-item">
        Waiting
      </h2>
      {waiting.length > 0 ? (
        <ul aria-label="Waiting" className="mt-3 space-y-1 text-sm">
          {waiting.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              groupId={null}
              groups={groups}
              tick={{
                checked: tickedIds.includes(member.user_id),
                onChange: (checked) =>
                  setTickedIds((ids) =>
                    checked ? [...ids, member.user_id] : ids.filter((id) => id !== member.user_id),
                  ),
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nobody is waiting.</p>
      )}
      {waiting.length > 0 ? (
        <PlaceTicked ticked={ticked} waiting={waiting} groups={groups} />
      ) : null}
    </section>
  );
}
