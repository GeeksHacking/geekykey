import type { EventGroup } from "@/api/types";

/** One group on the organisers' screen: its name, and who is in it. */
export function GroupPanel({ group }: { group: EventGroup }) {
  return (
    <section aria-labelledby={`group-${group.id}`} className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`group-${group.id}`} className="min-w-0 break-words font-semibold">
          {group.name}
        </h2>
        <span className="look-label shrink-0 text-muted-foreground">
          <span className="font-mono text-foreground">{group.members.length}</span> in it
        </span>
      </div>
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
