import { MapPin, WarningCircle } from "@phosphor-icons/react";

import type { EventGroup } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { GroupActions } from "@/features/groups/group-actions";
import { MemberRow } from "@/features/groups/member-row";

/** The fewest members a group should have, as Allocate gives each at least (spec story 36). */
const FEWEST_MEMBERS = 2;

/**
 * One group on the organizers' screen: its name, tags and location, how many are in it out of its
 * capacity, and who. A group past its capacity says so in words, however it got there, and so
 * does one with fewer than 2 members once allocation has started, so nobody is left alone.
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
  return (
    <section aria-labelledby={`group-${group.id}`} className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`group-${group.id}`} className="break-words font-semibold">
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
    </section>
  );
}

/** A problem with the group, in words and an icon as well as colour. */
function Flag({ children }: { children: string }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
      <WarningCircle weight="fill" className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
