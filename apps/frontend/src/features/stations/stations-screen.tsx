import { Broadcast } from "@phosphor-icons/react";

import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { LiveStamp } from "@/components/layout/live-stamp";
import { PageHeader } from "@/components/layout/page-header";
import { AddStationDialog } from "@/features/stations/add-station-dialog";
import { StationBoard } from "@/features/stations/station-board";
import { StationBoardSkeleton } from "@/features/stations/station-board-skeleton";
import { useStations } from "@/features/stations/use-stations";

export function StationsScreen() {
  const stations = useStations();
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
        description="Add the first station to get a key for its reader."
      />
    );
  } else {
    const online = list.filter((station) => station.online).length;
    body = (
      <div className="space-y-3">
        {stations.isError ? (
          <InlineQueryError
            error={stations.error}
            onRetry={() => void stations.refetch()}
            title="Station updates are delayed."
          />
        ) : null}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            <span className="font-mono text-foreground">{list.length}</span> stations,{" "}
            <span className="font-mono text-foreground">{online}</span> online
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
        description="Every reader station and whether it has checked in within the last two minutes. Refreshes every 12 seconds."
        actions={<AddStationDialog />}
      />
      {body}
    </div>
  );
}
