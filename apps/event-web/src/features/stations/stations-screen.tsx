import { Broadcast } from "@phosphor-icons/react";

import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { LiveStamp } from "@/components/layout/live-stamp";
import { PageHeader } from "@/components/layout/page-header";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { AddStationDialog } from "@/features/stations/add-station-dialog";
import { StationBoard } from "@/features/stations/station-board";
import { StationBoardSkeleton } from "@/features/stations/station-board-skeleton";
import { useStationBoard } from "@/features/stations/use-station-board";
import { showStaleNote } from "@/lib/rate-limit";

export function StationsScreen() {
  const stations = useStationBoard();
  const list = stations.data?.stations;

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
        <div className="look-label flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-muted-foreground">
          <span>
            <span className="font-mono text-foreground">{list.length}</span> stations,{" "}
            <span className="font-mono text-foreground">{online}</span> online
          </span>
          <LiveStamp updatedAt={stations.dataUpdatedAt} refreshing={stations.isFetching} />
        </div>
        {/* The brackets sit outside the table's own scroll region, so scrolling never clips them. */}
        <div className="relative">
          <CornerBrackets />
          <StationBoard stations={list} />
        </div>
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
