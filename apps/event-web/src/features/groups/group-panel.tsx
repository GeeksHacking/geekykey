import { MapPin, WarningCircle } from "@phosphor-icons/react";

import type { EventGroup } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { GroupActions } from "@/features/groups/group-actions";
import { DROP_OVER, usePlaceDrop } from "@/features/groups/member-drag";
import { MemberRow } from "@/features/groups/member-row";
import { cn } from "@/lib/utils";

/** The fewest members a group should have, as Allocate gives each at least (spec story 36). */
const FEWEST_MEMBERS = 2;

/**
 * One group on the organizers' screen: its name, tags and location, how many are in it out of its
 * capacity, and who. A group past its capacity says so in words, however it got there, and so
 * does one with fewer than 2 members once allocation has started, so nobody is left alone. The
 * groups it has reached go last, as the group's progress rather than its make-up (BAC-167).
 * Someone from elsewhere on the board can be dropped on it, empty or full (FRO-140).
 */
export function GroupPanel({
  group,
  groups,
  allocationStarted,
}: {
  group: EventGroup;
  /** Every group on the board, for the moves on each member's menu. */
  groups: EventGroup[];
  allocationStarted: boolean;
}) {
  const size = group.members.length;
  const overCapacity = group.capacity !== null && size > group.capacity;
  const tooSmall = allocationStarted && size < FEWEST_MEMBERS;
  const { ref: dropRef, over } = usePlaceDrop({
    place: group.id,
    memberIds: group.members.map(({ user_id }) => user_id),
  });
  return (
    <section
      ref={dropRef}
      aria-labelledby={`group-${group.id}`}
      data-drop-over={over || undefined}
      className={cn("rounded-lg border bg-card p-4", DROP_OVER)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`group-${group.id}`} className="type-item break-words">
            {group.name}
          </h2>
          <p className="look-label mt-0.5 text-muted-foreground">
            <span className="font-mono text-foreground">{size}</span>
            {group.capacity === null ? (
              " in it"
            ) : (
              <>
                {" of "}
                <span className="font-mono text-foreground">{group.capacity}</span>
              </>
            )}
          </p>
        </div>
        <GroupActions group={group} />
      </div>
      {group.location ? (
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{group.location}</span>
        </p>
      ) : null}
      {group.tags.length > 0 ? (
        <ul aria-label={`Tags of ${group.name}`} className="mt-2 flex flex-wrap gap-1">
          {group.tags.map((tag, index) => (
            <li key={index}>
              <Badge variant="muted">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {overCapacity ? <Flag>Over capacity</Flag> : null}
      {tooSmall ? <Flag>Fewer than 2 members</Flag> : null}
      {size > 0 ? (
        <ul aria-label={`Members of ${group.name}`} className="mt-3 space-y-1 text-sm">
          {group.members.map((member) => (
            <MemberRow key={member.user_id} member={member} groupId={group.id} groups={groups} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nobody here yet.</p>
      )}
      <ReachedLine group={group} groups={groups} />
    </section>
  );
}

/**
 * Which other groups this one has reached, by name in the board's order (BAC-167). Groups with
 * nobody in them can't reach or be reached, so they count for nothing here, as on the
 * participant's card. Nothing shows for an empty group, with no other group to reach, or from an
 * Event Service from before BAC-167, which doesn't say.
 */
function ReachedLine({ group, groups }: { group: EventGroup; groups: EventGroup[] }) {
  const reachedIds = group.reached_group_ids;
  const others = groups.filter((other) => other.id !== group.id && other.members.length > 0);
  if (!reachedIds || others.length === 0 || group.members.length === 0) return null;
  const reached = others.filter((other) => reachedIds.includes(other.id));
  return (
    <p className="mt-3 border-t pt-2 text-sm text-muted-foreground">
      {reached.length === others.length
        ? "Reached every other group"
        : reached.length === 0
          ? "Reached no other group yet"
          : `Reached ${reached.map((other) => other.name).join(", ")}`}
    </p>
  );
}

/** A problem with the group, in words and an icon as well as colour. */
function Flag({ children }: { children: string }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive-text">
      <WarningCircle weight="fill" className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
