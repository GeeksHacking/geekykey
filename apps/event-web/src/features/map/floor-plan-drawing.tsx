import type { FloorPlan } from "@/features/map/floor-plan";
import { SPOT_RADIUS } from "@/features/map/marker-size";

/** Booth names sit above the markers, clear of the relay and open seat labels. */
export function FloorPlanDrawing({ plan }: { plan: FloorPlan }) {
  return (
    <g aria-hidden>
      <rect
        width={plan.width}
        height={plan.height}
        rx="12"
        fill="none"
        strokeWidth="3"
        className="stroke-muted-foreground"
      />
      {plan.booths.map((booth) => (
        <g key={booth.name} transform={`translate(${booth.x} ${booth.y})`}>
          <circle
            r={SPOT_RADIUS}
            fill="none"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="stroke-muted-foreground/60"
          />
          <text
            y="-90"
            textAnchor="middle"
            fontSize="34"
            fontWeight="600"
            className="fill-foreground font-mono"
          >
            {booth.name}
          </text>
        </g>
      ))}
    </g>
  );
}
