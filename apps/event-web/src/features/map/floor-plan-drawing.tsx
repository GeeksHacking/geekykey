import type { FloorPlan } from "@/features/map/floor-plan";
import { SPOT_RADIUS } from "@/features/map/station-marker";

/**
 * The hall itself: floor, rooms, walls and labels, drawn in the theme's colours so the map
 * reads in light and dark. Each booth's spot is drawn faintly with its code, so an empty booth
 * still shows where a station could stand and what to set as its booth.
 */
export function FloorPlanDrawing({ plan }: { plan: FloorPlan }) {
  return (
    <g aria-hidden>
      <defs>
        <pattern id="map-floor-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1.2" className="fill-border" />
        </pattern>
        <pattern
          id="map-block-hatch"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" strokeWidth="3" className="stroke-border" />
        </pattern>
        <clipPath id="map-hall">
          <rect width={plan.width} height={plan.height} rx="12" />
        </clipPath>
      </defs>

      <rect width={plan.width} height={plan.height} rx="12" className="fill-background" />
      <rect width={plan.width} height={plan.height} rx="12" fill="url(#map-floor-dots)" />
      {plan.rooms.map((path) => (
        <path key={path} d={path} className="fill-card" />
      ))}
      {plan.blocks.map((block) => (
        <rect
          key={`${block.x},${block.y}`}
          {...block}
          fill="url(#map-block-hatch)"
          clipPath="url(#map-hall)"
        />
      ))}
      <g
        clipPath="url(#map-hall)"
        fill="none"
        strokeWidth="6"
        strokeLinecap="square"
        className="stroke-muted-foreground"
      >
        {plan.walls.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
      <rect
        x="1.5"
        y="1.5"
        width={plan.width - 3}
        height={plan.height - 3}
        rx="11"
        fill="none"
        strokeWidth="3"
        className="stroke-border"
      />

      {plan.labels.map((label) => (
        <text
          key={label.text}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          letterSpacing="2.5"
          className="fill-muted-foreground uppercase"
        >
          {label.text}
        </text>
      ))}

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
            y="5"
            textAnchor="middle"
            fontSize="13"
            className="fill-muted-foreground/70 font-mono"
          >
            {booth.name}
          </text>
        </g>
      ))}
    </g>
  );
}
