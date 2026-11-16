import { isApiErrorCode } from "@/api/errors";
import type { MapStation } from "@/api/types";
import { DataSourceNotice } from "@/components/layout/data-source-notice";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { Wordmark } from "@/components/layout/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { BOOTH_PLAN } from "@/features/map/floor-plan";
import { MapConnections } from "@/features/map/map-connections";
import { MapForbidden } from "@/features/map/map-forbidden";
import { hintHuntStations } from "@/features/map/hint-hunt";
import { MapHintHunt } from "@/features/map/map-hint-hunt";
import { MapRelay } from "@/features/map/map-relay";
import { MapPlan } from "@/features/map/map-plan";
import { placeStations } from "@/features/map/place-stations";
import { StationList } from "@/features/map/station-list";
import { useMap } from "@/features/map/use-map";
import { useOpenSeatMarks } from "@/features/map/use-open-seat-marks";
import { formatTimeWithSeconds } from "@/lib/format";
import { showStaleNote } from "@/lib/rate-limit";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/lib/use-sign-out";

const plan = BOOTH_PLAN;

/** A stable empty list for the loading and error states, so the seat hook sees one array. */
const EMPTY_STATIONS: readonly MapStation[] = [];

/**
 * The demo points at the web, so it gets the full-height main column. The booth plan takes
 * the spare height on the right; a long list scrolls in its own region so nothing scrolls on a projector.
 */
const LAYOUT =
  "grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-6";

/** The map on the big screen at our booth: every station at its booth, pulsing as taps arrive. */
export function MapScreen() {
  const map = useMap();
  const signOut = useSignOut("/map");
  const stations = map.data?.stations ?? EMPTY_STATIONS;
  const seatMarks = useOpenSeatMarks(stations, map.dataUpdatedAt);

  // A forbidden answer replaces the map even after it has loaded: polling stops on it, so
  // a frozen map with no way to log out would be all that's left.
  if (isApiErrorCode(map.error, "forbidden")) {
    return <MapForbidden onSignOut={() => void signOut()} />;
  }

  let body;
  if (map.isPending) {
    body = (
      <div className={LAYOUT} role="status" aria-label="Loading the map">
        <Skeleton className="h-64 w-full lg:col-start-2 lg:row-span-2" />
        <Skeleton className="h-80 w-full lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:h-full" />
        <Skeleton className="h-72 w-full lg:col-start-2 lg:row-start-3 lg:h-full" />
      </div>
    );
  } else if (!map.data) {
    body = (
      <div className="mx-auto max-w-md pt-16">
        <ErrorState
          error={map.error}
          onRetry={() => void map.refetch()}
          title="Couldn't load the map"
        />
      </div>
    );
  } else {
    const data = map.data;
    const { placed, unplaced } = placeStations(data.stations, plan, seatMarks);
    // The hint hunt's band takes height from the grid, so the plan keeps a floor and the list,
    // which also scrolls, gives up some of its room on a short screen.
    const hasHintHunt = hintHuntStations(data.stations).length > 0;
    body = (
      <MapRelay stations={data.stations} placed={placed}>
        {({ layer, status }) => (
          <>
            <MapHintHunt stations={data.stations} placed={placed} />
            <div
              className={cn(LAYOUT, hasHintHunt && "lg:grid-rows-[auto_minmax(12rem,1fr)_auto]")}
            >
              {status ? (
                <div className="lg:col-start-2 lg:row-start-1 lg:px-1.5">{status}</div>
              ) : null}
              <MapPlan
                plan={plan}
                placed={placed}
                stations={data.stations}
                seatMarks={seatMarks}
                className="lg:col-start-2 lg:row-start-2"
              >
                {layer}
              </MapPlan>
              {data.connections ? <MapConnections connections={data.connections} /> : null}
              <div
                className={cn(
                  "min-h-0 space-y-6 lg:col-start-2 lg:row-start-3 lg:max-h-[25dvh] lg:overflow-y-auto lg:px-1.5 lg:pb-1.5",
                  hasHintHunt && "lg:max-h-[16dvh]",
                )}
              >
                {showStaleNote(map.error, true) ? (
                  <StaleDataNote onRetry={() => void map.refetch()} />
                ) : map.isError ? (
                  <InlineQueryError
                    error={map.error}
                    onRetry={() => void map.refetch()}
                    title="The map is not updating."
                  />
                ) : null}
                {data.stations.length === 0 ? (
                  <p className="text-muted-foreground">
                    No stations yet. Each one appears here once an organiser adds it on the station
                    board and gives it a booth.
                  </p>
                ) : (
                  <StationList placed={placed} unplaced={unplaced} seatMarks={seatMarks} />
                )}
              </div>
            </div>
          </>
        )}
      </MapRelay>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[120rem] flex-col bg-look-grid px-6 py-5 lg:h-[100dvh] lg:px-10">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Wordmark />
          <h1 className="type-title whitespace-nowrap">Station map</h1>
          <span className="look-label text-muted-foreground">{plan.name}</span>
        </div>
        {map.data ? (
          <span className="look-label text-muted-foreground">
            Updated {formatTimeWithSeconds(new Date(map.dataUpdatedAt).toISOString())}
          </span>
        ) : null}
      </header>
      <DataSourceNotice />
      {body}
    </main>
  );
}
