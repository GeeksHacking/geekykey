import { ArrowDown, ArrowUp } from "@phosphor-icons/react";

import type { AdminKindToken } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  isClaimed,
  type ClaimedKindToken,
  type KindTokenSort,
} from "@/features/token-kinds/kind-token-view";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { title: "UID", sortKey: "uid" },
  { title: "Kind", sortKey: "kind" },
  { title: "Owner ID" },
  { title: "Claimed" },
  { title: "Actions" },
] as const;

export function KindTokenTable({
  tokens,
  sort,
  busy,
  onRelease,
  onRemove,
}: {
  tokens: AdminKindToken[];
  sort: KindTokenSort;
  busy: boolean;
  onRelease: (token: ClaimedKindToken) => void;
  onRemove: (uid: string) => void;
}) {
  const descending = sort.endsWith("desc");
  return (
    <div className="relative mt-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">Tokens, kinds and current claims</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              {COLUMNS.map((column, index) => {
                const sorted = "sortKey" in column && sort.startsWith(column.sortKey);
                const Arrow = descending ? ArrowDown : ArrowUp;
                return (
                  <th
                    scope="col"
                    key={column.title}
                    aria-sort={sorted ? (descending ? "descending" : "ascending") : undefined}
                    className={cn(
                      "px-3 py-3 font-medium",
                      // The UID heading stays with its column. Opaque, with the header's tint.
                      index === 0 &&
                        "sticky left-0 bg-background shadow-[inset_0_0_0_100vmax_hsl(var(--muted)/0.4)] sm:static sm:bg-transparent sm:shadow-none",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.title}
                      {sorted ? <Arrow aria-hidden className="size-3.5 text-primary-text" /> : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {tokens.map((token) => (
              <tr key={token.uid} className="group transition-colors hover:bg-accent/50">
                {/* Stays in view while a phone scrolls across to the actions. */}
                <th
                  scope="row"
                  className="sticky left-0 bg-background px-3 py-3 font-mono font-normal transition-colors group-hover:bg-accent sm:static sm:bg-transparent sm:group-hover:bg-transparent"
                >
                  {token.uid}
                </th>
                <td className="px-3 py-3">
                  {token.kind ?? <span className="text-muted-foreground">No kind</span>}
                </td>
                <td className="max-w-64 min-w-44 px-3 py-3 font-mono break-all">
                  {token.owner_id ?? (
                    <span className="font-sans text-muted-foreground">Unclaimed</span>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {token.claimed_at ? (
                    <time dateTime={token.claimed_at} title={token.claimed_at}>
                      {formatWhen(token.claimed_at)}
                    </time>
                  ) : (
                    <span className="text-muted-foreground">Not claimed</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {isClaimed(token) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Release ${token.uid}`}
                        className="h-9 text-sm"
                        onClick={() => onRelease(token)}
                      >
                        Release
                      </Button>
                    ) : null}
                    {token.kind === null ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Remove ${token.uid}`}
                        className="h-9 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRemove(token.uid)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* A hint on a phone that the actions are further across. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-px right-px w-8 rounded-r-lg bg-linear-to-l from-background sm:hidden"
      />
    </div>
  );
}
