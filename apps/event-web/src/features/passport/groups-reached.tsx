import { CheckCircle } from "@phosphor-icons/react";

import type { OtherGroup } from "@/api/types";

/**
 * Under a participant's group: every other group with someone in it, and whether their group has
 * reached it, by a connection between any of its members and one of that group's (BAC-167). Names
 * only, with no count or score, and nothing at all when there's no other group to reach.
 */
export function GroupsReached({ others }: { others: OtherGroup[] }) {
  if (others.length === 0) return null;
  const all = others.every((other) => other.reached);
  return (
    <div className="mt-4 border-t pt-3">
      <p className="look-label text-muted-foreground">Other groups</p>
      <ul aria-label="Other groups" className="mt-2 space-y-1 text-sm">
        {/* Group names are unique, whatever their capitals. */}
        {others.map((other) => (
          <li key={other.name} className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words">{other.name}</span>
            {other.reached ? (
              <span className="flex shrink-0 items-center gap-1 font-medium">
                <CheckCircle weight="fill" className="h-4 w-4" aria-hidden />
                Reached
              </span>
            ) : (
              <span className="shrink-0 text-muted-foreground">Not yet</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted-foreground">
        {all
          ? "Your group has reached every other group."
          : "Connect with someone from each group to reach it."}
      </p>
    </div>
  );
}
