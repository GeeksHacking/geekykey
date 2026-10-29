import { createFileRoute } from "@tanstack/react-router";

import { RequireSession } from "@/features/auth/require-session";
import { MapScreen } from "@/features/map/map-screen";

/**
 * The map on the big screen. No role gate: a map screen's /me says participant, so the
 * map's own answer decides who may see it (agreement 9.10). GSAP loads with this route only.
 */
export const Route = createFileRoute("/map")({
  component: MapRoute,
});

function MapRoute() {
  return (
    <RequireSession>
      <MapScreen />
    </RequireSession>
  );
}
