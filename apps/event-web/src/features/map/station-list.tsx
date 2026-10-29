import { MapPinSimpleArea, Prohibit } from "@phosphor-icons/react";

import type { MapStation } from "@/api/types";
import type { PlacedStation } from "@/features/map/place-stations";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Beside the plan: every station by name, since the plan itself shows only booth codes. The
 * stations it couldn't place come last, under their own heading, so an organizer sees which
 * ones need a booth.
 */
export function StationList({
  placed,
  unplaced,
}: {
  placed: readonly PlacedStation[];
  unplaced: readonly MapStation[];
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="map-stations-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="map-stations-heading" className="text-lg font-semibold tracking-heading">
            On the map
          </h2>
          <span className="text-sm text-muted-foreground">People who tapped</span>
        </div>
        {placed.length === 0 ? (
          <p className="text-muted-foreground">
            No station has a booth on this plan yet. Give one a booth such as A1 and it appears
            here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {placed.map(({ station, booth }) => (
              <StationRow key={station.station_id} station={station} code={booth.name} />
            ))}
          </ul>
        )}
      </section>

      {unplaced.length > 0 ? (
        <section aria-labelledby="map-unplaced-heading" className="space-y-3">
          <div>
            <h2
              id="map-unplaced-heading"
              className="flex items-center gap-2 text-lg font-semibold tracking-heading"
            >
              <MapPinSimpleArea className="h-5 w-5 text-status-cooldown" aria-hidden />
              Not on the map
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These have no booth, or a booth this plan doesn't name.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-status-cooldown/40 bg-card">
            {unplaced.map((station) => (
              <StationRow key={station.station_id} station={station} code={null} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StationRow({ station, code }: { station: MapStation; code: string | null }) {
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
      {code ? (
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border font-mono text-sm font-bold",
            station.disabled
              ? "border-dashed border-muted-foreground bg-muted text-muted-foreground"
              : "border-primary-edge bg-primary text-primary-foreground",
          )}
        >
          {code}
        </span>
      ) : (
        <span className="font-mono text-sm text-muted-foreground">
          {station.booth ? station.booth : "None"}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-base font-medium">
          {station.name ?? "Unnamed station"}
        </span>
        {station.disabled ? (
          <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <Prohibit className="h-3.5 w-3.5" aria-hidden />
            Disabled
          </span>
        ) : null}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {formatCount(station.unique_participants)}
      </span>
    </li>
  );
}
