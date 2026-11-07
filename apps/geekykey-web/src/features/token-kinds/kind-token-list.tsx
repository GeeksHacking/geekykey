import { ArrowClockwise } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KindTokenFilters } from "@/features/token-kinds/kind-token-filters";
import {
  isFiltering,
  START_QUERY,
  viewKindTokens,
  type ClaimedKindToken,
  type KindTokenQuery,
} from "@/features/token-kinds/kind-token-view";
import { KindTokenTable } from "@/features/token-kinds/kind-token-table";
import { ReleaseKindTokenDialog } from "@/features/token-kinds/release-kind-token-dialog";
import { RemoveKindDialog } from "@/features/token-kinds/remove-kind-dialog";
import { SectionTitle } from "@/features/token-kinds/section-title";
import { useKindTokens, useKindsWritePending } from "@/features/token-kinds/use-token-kinds";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/** Only mounted for a GeekyKey admin. Organisers never request UIDs (agreement 10.2). */
export function KindTokenList() {
  const id = useId();
  const tokens = useKindTokens();
  const busy = useKindsWritePending();
  const [query, setQuery] = useState(START_QUERY);
  const [page, setPage] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<ClaimedKindToken | null>(null);

  const all = useMemo(() => tokens.data ?? [], [tokens.data]);
  const filtered = useMemo(() => viewKindTokens(all, query), [all, query]);
  const kinds = useMemo(() => [...new Set(all.flatMap((token) => token.kind ?? []))].sort(), [all]);
  // A release or refresh can shorten the list, so the page is kept inside it.
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const filtering = isFiltering(query);

  /** Every filter or sort change starts again from the first page. */
  function change(next: Partial<KindTokenQuery>) {
    setQuery((current) => ({ ...current, ...next }));
    setPage(0);
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id={`${id}-heading`}>Every token</SectionTitle>
        <Button
          variant="outline"
          disabled={tokens.isFetching || busy}
          onClick={() => void tokens.refetch()}
        >
          <ArrowClockwise aria-hidden className={cn(tokens.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Includes claimed tokens with no kind. Release a claimed token before removing its kind.
      </p>

      <KindTokenFilters query={query} kinds={kinds} onChange={change} />

      {tokens.isError ? (
        <div className="mt-4">
          <ErrorState error={tokens.error} onRetry={() => void tokens.refetch()} />
        </div>
      ) : null}
      {tokens.isPending ? (
        <Skeleton className="mt-4 h-40 w-full" aria-label="Loading tokens" />
      ) : tokens.isError ? null : (
        <>
          <p role="status" className="mt-5 text-sm font-medium tabular-nums">
            {filtering
              ? `${filtered.length} of ${all.length} tokens found`
              : `${filtered.length} ${filtered.length === 1 ? "token" : "tokens"} found`}
          </p>
          {filtered.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed p-6 text-center">
              {query.ownership === "all"
                ? "No tokens match. Clear the search or choose another kind."
                : "No tokens match. Clear the search, choose another kind or show all owners."}
            </p>
          ) : (
            <KindTokenTable
              tokens={filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)}
              sort={query.sort}
              busy={busy}
              onRelease={setReleasing}
              onRemove={setRemoving}
            />
          )}
          {pages > 1 ? (
            <nav aria-label="Token pages" className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span className="text-sm tabular-nums">
                Page {currentPage + 1} of {pages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
      {removing === null ? null : (
        <RemoveKindDialog uid={removing} onClose={() => setRemoving(null)} />
      )}
      {releasing === null ? null : (
        <ReleaseKindTokenDialog
          confirmed={releasing}
          current={all.find((token) => token.uid === releasing.uid)}
          listState={tokens.isFetching ? "refreshing" : tokens.isError ? "failed" : "fresh"}
          onClose={() => setReleasing(null)}
        />
      )}
    </section>
  );
}
