import { WarningCircle } from "@phosphor-icons/react";

import type { EventGroup } from "@/api/types";

/**
 * One group on the organizers' screen: its name, how many are in it out of its capacity, and
 * who. A group past its capacity says so in words, however it got there.
 */
export function GroupPanel({ group }: { group: EventGroup }) {
  const size = group.members.length;
  const overCapacity = group.capacity !== null && size > group.capacity;
  return (
    <section aria-labelledby={`group-${group.id}`} className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`group-${group.id}`} className="min-w-0 break-words font-semibold">
          {group.name}
        </h2>
        <span className="look-label shrink-0 text-muted-foreground">
          {group.capacity === null ? (
            <>
              <span className="font-mono text-foreground">{size}</span> in it
            </>
          ) : (
            <>
              <span className="font-mono text-foreground">{size}</span> of{" "}
              <span className="font-mono text-foreground">{group.capacity}</span>
            </>
          )}
        </span>
      </div>
      {overCapacity ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
          <WarningCircle weight="fill" className="h-3 w-3 shrink-0" aria-hidden />
          Over capacity
        </p>
      ) : null}
      {group.members.length > 0 ? (
        <ul aria-label={`Members of ${group.name}`} className="mt-3 space-y-1 text-sm">
          {group.members.map((member) => (
            <li key={member.user_id}>{member.display_name}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nobody here yet.</p>
      )}
    </section>
  );
}
