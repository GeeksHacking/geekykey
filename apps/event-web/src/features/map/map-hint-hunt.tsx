import { useEffect, useState } from "react";

import type { MapStation } from "@/api/types";
import { hintHuntStations } from "@/features/map/hint-hunt";
import { MapHintHuntCard } from "@/features/map/map-hint-hunt-card";
import type { PlacedStation } from "@/features/map/place-stations";
import { useMapHintHunt } from "@/features/map/use-map-hint-hunt";

/**
 * One poll for every station's latest round; a local clock keeps cached countdowns moving. The
 * cards go above the map's grid, so the relay and the booth plan keep their room (FRO-190 review).
 */
export function MapHintHunt({
  stations,
  placed,
}: {
  stations: readonly MapStation[];
  placed: readonly PlacedStation[];
}) {
  const hunts = hintHuntStations(stations);
  const enabled = hunts.length > 0;
  const { data, dataUpdatedAt } = useMapHintHunt(enabled);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  if (!data || !enabled) return null;
  return (
    <div className="mb-6 shrink-0 space-y-4">
      {hunts.map((station) => (
        <MapHintHuntCard
          key={station.station_id}
          booth={
            // The plan's name for a placed station, else the free text the plan didn't match.
            placed.find((item) => item.station.station_id === station.station_id)?.booth.name ??
            station.booth ??
            "No booth"
          }
          round={data.hint_hunt?.rounds.find((round) => round.station_id === station.station_id)}
          now={Math.max(now, dataUpdatedAt)}
        />
      ))}
    </div>
  );
}
