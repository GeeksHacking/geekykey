import type { GroupWaitingMember } from "@/api/types";
import { DROP_OVER, usePlaceDrop } from "@/features/groups/member-drag";
import { MemberRow } from "@/features/groups/member-row";
import { cn } from "@/lib/utils";

/**
 * Everyone who has joined and has no group, with their menus. Someone dragged here from a group
 * goes back to waiting (FRO-140).
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
            <MemberRow key={member.user_id} member={member} groupId={null} groups={groups} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nobody is waiting.</p>
      )}
    </section>
  );
}
