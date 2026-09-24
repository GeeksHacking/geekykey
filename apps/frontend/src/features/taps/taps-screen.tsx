import { HandTap } from "@phosphor-icons/react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { LiveStamp } from "@/components/layout/live-stamp";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ScanLogFilters } from "@/features/taps/scan-log-filters";
import { ScanLogSkeleton } from "@/features/taps/scan-log-skeleton";
import { ScanLogTable } from "@/features/taps/scan-log-table";
import { useScanLog, type ScanLogFilters as Filters } from "@/features/taps/use-scan-log";
import { useStationOptions } from "@/features/taps/use-station-options";

export function TapsScreen() {
  const [filters, setFilters] = useState<Filters>({});
  const { stations } = useStationOptions();
  const log = useScanLog(filters);
  const filtered = filters.station_id !== undefined || filters.status !== undefined;

  let body;
  if (log.isPending) {
    body = <ScanLogSkeleton />;
  } else if (log.isError && log.taps.length === 0) {
    body = <ErrorState error={log.error} onRetry={() => void log.refetch()} />;
  } else if (log.taps.length === 0) {
    body = (
      <EmptyState
        icon={HandTap}
        title={filtered ? "No taps match these filters" : "No taps yet"}
        description={
          filtered
            ? "Try a different station or status."
            : "Taps appear here within a few seconds of a token touching a station."
        }
      />
    );
  } else {
    body = (
      <div className="space-y-3">
        {log.error ? (
          <InlineQueryError
            error={log.error}
            onRetry={() => void log.refetch()}
            title="Live updates are delayed."
          />
        ) : null}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing <span className="font-mono text-foreground">{log.taps.length}</span> taps
          </span>
          <LiveStamp updatedAt={log.dataUpdatedAt} refreshing={log.isFetching} />
        </div>
        <ScanLogTable taps={log.taps} />
        {log.loadMoreError ? (
          <InlineQueryError
            error={log.loadMoreError}
            onRetry={log.retryLoadMore}
            title="Older taps could not load."
          />
        ) : null}
        {log.hasMore ? (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => void log.loadMore()}
              disabled={log.loadingMore}
            >
              {log.loadingMore ? "Loading" : "Load older taps"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan log"
        description="Every tap from every station, newest first, including the ones that did not count. Refreshes every 5 seconds."
      />
      <ScanLogFilters filters={filters} onChange={setFilters} stations={stations} />
      {body}
    </div>
  );
}
