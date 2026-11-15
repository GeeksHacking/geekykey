import { useRef, type ReactNode } from "react";

import type { MapStation } from "@/api/types";
import type { FloorPlan } from "@/features/map/floor-plan";
import { FloorPlanDrawing } from "@/features/map/floor-plan-drawing";
import type { PlacedStation } from "@/features/map/place-stations";
import type { SeatMark } from "@/features/map/seat-marks";
import { StationMarker } from "@/features/map/station-marker";
import { useMapPulses } from "@/features/map/use-map-pulses";
import { cn } from "@/lib/utils";

/** Room around the table for the markers' rings and counts, in plan units. */
const MARGIN = 24;

/**
 * The booth plan with each placed station on it. The list beside it carries the same stations as
 * text, so the drawing is one labelled image to a screen reader.
 */
export function MapPlan({
  plan,
  placed,
  stations,
  seatMarks,
  className,
  children,
}: {
  plan: FloorPlan;
  placed: readonly PlacedStation[];
  stations: readonly MapStation[];
  seatMarks?: ReadonlyMap<string, SeatMark>;
  className?: string;
  children?: ReactNode;
}) {
  // Only crowded shared booths need extra rows. Keep the real two-station table compact.
  const drawing = { ...plan, height: Math.max(plan.height, ...placed.map((item) => item.y + 124)) };
  const svg = useRef<SVGSVGElement>(null);
  useMapPulses(svg, stations);

  return (
    <svg
      ref={svg}
      role="img"
      aria-label={`${plan.name}, with ${placed.length} ${placed.length === 1 ? "station" : "stations"} at their booths`}
      viewBox={`${-MARGIN} ${-MARGIN} ${plan.width + MARGIN * 2} ${drawing.height + MARGIN * 2}`}
      className={cn("h-auto w-full font-sans lg:h-full lg:min-h-0", className)}
    >
      <FloorPlanDrawing plan={drawing} />
      {children}
      <g aria-hidden>
        {placed.map((item) => (
          <StationMarker
            key={item.station.station_id}
            placed={item}
            seat={seatMarks?.get(item.station.station_id)}
          />
        ))}
      </g>
    </svg>
  );
}
