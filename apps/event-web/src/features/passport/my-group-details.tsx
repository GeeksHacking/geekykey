import { MapPin } from "@phosphor-icons/react";

import type { MyGroup } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { GroupsReached } from "@/features/passport/groups-reached";

/**
 * What a placed participant sees of their group: its name, where to go, its tags and the other
 * members' names (the spec's user stories 45 and 46), then which other groups it has reached
 * (BAC-167).
 */
export function MyGroupDetails({ group }: { group: MyGroup }) {
  return (
    <>
      <h2 className="type-lead mt-1">{group.name}</h2>
      {group.location ? (
        <p className="mt-1 flex items-center gap-1 text-sm font-medium">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{group.location}</span>
        </p>
      ) : null}
      {group.tags.length > 0 ? (
        <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1">
          {group.tags.map((tag, index) => (
            <li key={index}>
              <Badge variant="muted">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <ul aria-label="Members" className="mt-3 space-y-1 text-sm">
        {/* Names can repeat, and the answer has no IDs, so the order tells them apart. */}
        {group.members.map((member, index) => (
          <li key={index}>{member.display_name}</li>
        ))}
      </ul>
      {/* An Event Service from before BAC-167 doesn't say. */}
      {group.other_groups ? <GroupsReached others={group.other_groups} /> : null}
    </>
  );
}
