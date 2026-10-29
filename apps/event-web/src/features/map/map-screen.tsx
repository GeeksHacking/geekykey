import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { describeError, isApiErrorCode } from "@/api/errors";
import { DataSourceNotice } from "@/components/layout/data-source-notice";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { Wordmark } from "@/components/layout/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { MPH_EXAMPLE_PLAN } from "@/features/map/floor-plan";
import { MapForbidden } from "@/features/map/map-forbidden";
import { MapPlan } from "@/features/map/map-plan";
import { placeStations } from "@/features/map/place-stations";
import { StationList } from "@/features/map/station-list";
import { useMap } from "@/features/map/use-map";
import { formatTimeWithSeconds } from "@/lib/format";
import { showStaleNote } from "@/lib/rate-limit";
import { useSession } from "@/lib/session";

const plan = MPH_EXAMPLE_PLAN;

/**
 * On a big screen the plan takes the full height left under the header and the list sits
 * beside it, both centred, so a projector shows the whole hall without scrolling.
 */
const LAYOUT =
  "grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[auto_minmax(20rem,30rem)] lg:justify-center lg:gap-12";

/** The map on the big screen at our booth: every station at its booth, pulsing as taps arrive. */
export function MapScreen() {
  const map = useMap();
  const session = useSession();
  const navigate = useNavigate();

  async function signOut() {
    try {
      await session.signOut();
      await navigate({ to: "/login", search: { return_to: "/map" }, replace: true });
    } catch (error) {
      toast.error(describeError(error));
    }
  }

  // A forbidden answer replaces the map even after it has loaded: polling stops on it, so
  // a frozen map with no way to log out would be all that's left.
  if (isApiErrorCode(map.error, "forbidden")) {
    return <MapForbidden onSignOut={() => void signOut()} />;
  }

  let body;
  if (map.isPending) {
    body = (
      <div className={LAYOUT} role="status" aria-label="Loading the map">
        <Skeleton className="aspect-[588/1008] w-full lg:h-full lg:w-auto" />
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-72 w-full" />
        </div>
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
    const { placed, unplaced } = placeStations(map.data.stations, plan);
    body = (
      <div className={LAYOUT}>
        <MapPlan plan={plan} placed={placed} stations={map.data.stations} />
        <div className="space-y-6 lg:h-full lg:overflow-y-auto lg:pr-1">
          {showStaleNote(map.error, true) ? (
            <StaleDataNote onRetry={() => void map.refetch()} />
          ) : map.isError ? (
            <InlineQueryError
              error={map.error}
              onRetry={() => void map.refetch()}
              title="The map is not updating."
            />
          ) : null}
          {map.data.stations.length === 0 ? (
            <p className="text-muted-foreground">
              No stations yet. Each one appears here once an organiser adds it on the station board
              and gives it a booth.
            </p>
          ) : (
            <StationList placed={placed} unplaced={unplaced} />
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[120rem] flex-col px-6 py-5 lg:h-[100dvh] lg:px-10">
      <header className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Wordmark />
          <h1 className="text-xl font-semibold whitespace-nowrap tracking-heading">Station map</h1>
          <span className="text-sm text-muted-foreground">{plan.name}</span>
        </div>
        {map.data ? (
          <span className="font-mono text-sm text-muted-foreground">
            Updated {formatTimeWithSeconds(new Date(map.dataUpdatedAt).toISOString())}
          </span>
        ) : null}
      </header>
      <DataSourceNotice />
      {body}
    </main>
  );
}
