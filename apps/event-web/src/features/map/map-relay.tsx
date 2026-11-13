import { useEffect, useState, type ReactNode } from "react";

import type { MapRelayResponse, MapStation } from "@/api/types";
import type { PlacedStation } from "@/features/map/place-stations";
import { MapRelayDrawing } from "@/features/map/map-relay-drawing";
import { MapRelayStatus } from "@/features/map/map-relay-status";
import { deriveRelay, RELAY_RESULT_MS } from "@/features/map/relay";
import { useMapRelay } from "@/features/map/use-map-relay";

/** One relay request supplies both the SVG layer and the adjacent status. */
export function MapRelay({
  stations,
  placed,
  children,
}: {
  stations: readonly MapStation[];
  placed: readonly PlacedStation[];
  children: (parts: { layer: ReactNode; status: ReactNode }) => ReactNode;
}) {
  const { data, dataUpdatedAt } = useMapRelay(stations.some((station) => station.game === "relay"));
  // Previous-poll snapshot is solely for change feedback, as with the map's tap pulses.
  const [observed, setObserved] = useState<{
    current: MapRelayResponse | undefined;
    previous: MapRelayResponse | undefined;
  }>({ current: data, previous: undefined });
  if (observed.current !== data) setObserved({ current: data, previous: observed.current });
  const [now, setNow] = useState(Date.now);
  const endedAt = data?.relay?.game?.ended_at;
  // Expire even if subsequent polls fail or keep returning the identical ended game.
  useEffect(() => {
    if (!endedAt) return;
    const remaining = Date.parse(endedAt) + RELAY_RESULT_MS - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [endedAt]);
  const view = deriveRelay(observed.previous, data, placed, Math.max(now, dataUpdatedAt));
  return children({
    layer: view ? <MapRelayDrawing view={view} data={data} /> : null,
    status: view ? <MapRelayStatus view={view} /> : null,
  });
}
