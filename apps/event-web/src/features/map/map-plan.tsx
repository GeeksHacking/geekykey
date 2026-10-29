import { useRef } from "react";

import type { MapStation } from "@/api/types";
import type { FloorPlan } from "@/features/map/floor-plan";
import { FloorPlanDrawing } from "@/features/map/floor-plan-drawing";
import type { PlacedStation } from "@/features/map/place-stations";
import { StationMarker } from "@/features/map/station-marker";
import { useMapPulses } from "@/features/map/use-map-pulses";

/** Room around the hall for the markers' rings and counts, in plan units. */
const MARGIN = 24;

/**
 * The plan with each placed station on it. The list beside it carries the same stations as
 * text, so the drawing is one labelled image to a screen reader.
 */
export function MapPlan({
  plan,
  placed,
  stations,
}: {
  plan: FloorPlan;
  placed: readonly PlacedStation[];
  stations: readonly MapStation[];
}) {
  const svg = useRef<SVGSVGElement>(null);
  useMapPulses(svg, stations);

  return (
    <svg
      ref={svg}
      role="img"
      aria-label={`${plan.name}, with ${placed.length} ${placed.length === 1 ? "station" : "stations"} at their booths`}
      viewBox={`${-MARGIN} ${-MARGIN} ${plan.width + MARGIN * 2} ${plan.height + MARGIN * 2}`}
      className="h-auto w-full font-sans lg:h-full lg:w-auto"
    >
      <FloorPlanDrawing plan={plan} />
      <g aria-hidden>
        {placed.map((item) => (
          <StationMarker key={item.station.station_id} placed={item} />
        ))}
      </g>
    </svg>
  );
}
