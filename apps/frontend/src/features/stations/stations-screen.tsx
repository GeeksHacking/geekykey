import { Broadcast, WarningCircle } from "@phosphor-icons/react";

import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { LiveStamp } from "@/components/layout/live-stamp";
import { PageHeader } from "@/components/layout/page-header";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { AddStationDialog } from "@/features/stations/add-station-dialog";
import { StationBoard } from "@/features/stations/station-board";
import { StationBoardSkeleton } from "@/features/stations/station-board-skeleton";
import { useStationBoard } from "@/features/stations/use-station-board";
import { showStaleNote } from "@/lib/rate-limit";

/**
 * Shown when the GeekyKey Service's status call failed or was slow (agreement 9.2).
 * No retry button: the request succeeded and returned what this event knows.
 */
function StatusUnknownNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-status-unknown/40 bg-status-unknown/5 px-4 py-3 text-sm"
    >
      <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-unknown" aria-hidden />
      <span>
        <strong className="font-medium">Couldn&apos;t get the stations&apos; status.</strong>{" "}
        Showing what this event knows.
      </span>
    </div>
  );
}

export function StationsScreen() {
  const stations = useStationBoard();
  const list = stations.data?.stations;
  // The status call to the GeekyKey Service failed or was slow, so this event knows
  // the passport and the taps but not whether a station is answering (agreement 9.2).
  const statusUnknown = stations.data?.status_known === false;

  let body;
  if (!list) {
    body = stations.isError ? (
      <ErrorState error={stations.error} onRetry={() => void stations.refetch()} />
    ) : (
      <StationBoardSkeleton />
    );
  } else if (list.length === 0) {
    body = (
      <EmptyState
        icon={Broadcast}
        title="No stations yet"
        description="Add the first station to get a key for it."
      />
    );
  } else {
    const online = list.filter((station) => station.online === true).length;
    body = (
      <div className="space-y-3">
        {showStaleNote(stations.error, list !== undefined) ? (
          <StaleDataNote onRetry={() => void stations.refetch()} />
        ) : stations.isError ? (
          <InlineQueryError
            error={stations.error}
            onRetry={() => void stations.refetch()}
            title="Station updates are delayed."
          />
        ) : null}
        {statusUnknown ? <StatusUnknownNotice /> : null}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            <span className="font-mono text-foreground">{list.length}</span> stations
            {statusUnknown ? null : (
              <>
                , <span className="font-mono text-foreground">{online}</span> online
              </>
            )}
          </span>
          <LiveStamp updatedAt={stations.dataUpdatedAt} refreshing={stations.isFetching} />
        </div>
        <StationBoard stations={list} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stations"
        description="Every station and whether it has checked in within the last two minutes. Refreshes every 12 seconds."
        actions={<AddStationDialog />}
      />
      {body}
    </div>
  );
}
