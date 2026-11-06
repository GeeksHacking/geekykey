import { useId, useState } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RemoveKindDialog } from "@/features/token-kinds/remove-kind-dialog";
import { useKindTokens, useKindsWritePending } from "@/features/token-kinds/use-token-kinds";
import { KindTokenTable } from "@/features/token-kinds/kind-token-table";

const PAGE_SIZE = 50;

/** Only mounted for a GeekyKey admin. Organisers never request UIDs (agreement 10.2). */
export function KindTokenList() {
  const id = useId();
  const tokens = useKindTokens();
  const busy = useKindsWritePending();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const normalizedSearch = search.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const filtered = (tokens.data ?? []).filter(
    (token) =>
      token.uid.includes(normalizedSearch) &&
      (kind === "" || (kind === "none" ? token.kind === null : `kind:${token.kind}` === kind)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const kinds = [...new Set((tokens.data ?? []).flatMap((token) => token.kind ?? []))].sort();

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          Every token
        </h2>
        <Button
          variant="outline"
          disabled={tokens.isFetching || busy}
          onClick={() => void tokens.refetch()}
        >
          Refresh
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Includes claimed tokens with no kind. Release a claimed token before removing its kind.
      </p>
      <div className="mt-4 flex flex-wrap gap-4">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={`${id}-search`} className="text-sm font-medium">
            Search by UID
          </label>
          <Input
            id={`${id}-search`}
            value={search}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 font-mono"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div>
          <label htmlFor={`${id}-kind`} className="text-sm font-medium">
            Filter by kind
          </label>
          <select
            id={`${id}-kind`}
            value={kind}
            className="mt-2 block h-10 rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => {
              setKind(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All kinds</option>
            {kinds.map((value) => (
              <option key={value} value={`kind:${value}`}>
                {value}
              </option>
            ))}
            <option value="none">No kind</option>
          </select>
        </div>
      </div>
      {tokens.isError ? (
        <div className="mt-4">
          <ErrorState error={tokens.error} onRetry={() => void tokens.refetch()} />
        </div>
      ) : null}
      {tokens.isPending ? (
        <Skeleton className="mt-4 h-40 w-full" aria-label="Loading tokens" />
      ) : tokens.isError ? null : (
        <>
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {filtered.length} tokens found
          </p>
          {filtered.length === 0 ? (
            <p className="mt-3">No tokens match. Clear the search or choose another kind.</p>
          ) : (
            <KindTokenTable
              tokens={filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)}
              busy={busy}
              onRemove={setRemoving}
            />
          )}
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
        </>
      )}
      {removing === null ? null : (
        <RemoveKindDialog uid={removing} onClose={() => setRemoving(null)} />
      )}
    </section>
  );
}
