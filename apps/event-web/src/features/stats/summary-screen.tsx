import { HandTap } from "@phosphor-icons/react";

import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { PageHeader } from "@/components/layout/page-header";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/features/stats/export-button";
import { StatTile } from "@/features/stats/stat-tile";
import { StationBreakdown } from "@/features/stats/station-breakdown";
import { useStats } from "@/features/stats/use-stats";
import { showStaleNote } from "@/lib/rate-limit";

export function SummaryScreen() {
  const stats = useStats();

  let body;
  if (stats.isPending) {
    body = (
      <div className="space-y-8" role="status" aria-label="Loading summary">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-2 py-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (!stats.data) {
    body = <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  } else {
    const data = stats.data;
    body = (
      <div className="space-y-10">
        {showStaleNote(stats.error, stats.data !== undefined) ? (
          <StaleDataNote onRetry={() => void stats.refetch()} />
        ) : stats.isError ? (
          <InlineQueryError
            error={stats.error}
            onRetry={() => void stats.refetch()}
            title="Summary updates are delayed."
          />
        ) : null}
        <div className="relative">
          <CornerBrackets />
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x">
            <StatTile
              label="Total taps"
              value={data.total_taps}
              hint="Every status, including ones that did not count"
            />
            <StatTile
              label="Accepted taps"
              value={data.accepted_taps}
              hint="Counted for stamps and points"
            />
            <StatTile
              label="Unique participants"
              value={data.unique_participants}
              hint="With at least one accepted tap"
            />
          </div>
        </div>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">By station</h2>
          {data.total_taps === 0 ? (
            <EmptyState
              icon={HandTap}
              title="No taps yet"
              description="Totals fill in once the first station comes online and someone taps."
            />
          ) : (
            <div className="relative">
              <CornerBrackets />
              <StationBreakdown stations={data.stations} />
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Summary"
        description="Totals for this event so far. The CSV holds every tap with every status, which is the feed for the A/B analysis."
        actions={<ExportButton />}
      />
      {body}
    </div>
  );
}
