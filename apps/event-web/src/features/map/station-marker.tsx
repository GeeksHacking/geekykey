import { PILL_FONT, pillText, pillWidth, SPOT_RADIUS } from "@/features/map/marker-size";
import type { PlacedStation } from "@/features/map/place-stations";
import { cn } from "@/lib/utils";

/**
 * One station on the plan: a yellow spot with its booth's code, and under it how many people
 * have tapped there. A disabled station is grey, dashed and says so in words, never by colour
 * alone. The ring is what the pulse animates.
 */
export function StationMarker({ placed }: { placed: PlacedStation }) {
  const { station, booth, x, y } = placed;
  const pill = pillText(station);
  const width = pillWidth(pill);

  return (
    <g transform={`translate(${x} ${y})`} data-station={station.station_id}>
      <circle
        data-pulse={station.station_id}
        r={SPOT_RADIUS}
        fill="none"
        strokeWidth="3"
        opacity="0"
        className="stroke-primary"
      />
      {station.disabled ? null : (
        <circle r={SPOT_RADIUS + 7} fill="none" strokeWidth="2" className="stroke-primary/30" />
      )}
      <circle
        r={SPOT_RADIUS}
        strokeWidth={station.disabled ? 1.5 : 1}
        strokeDasharray={station.disabled ? "4 3" : undefined}
        className={
          station.disabled
            ? "fill-muted stroke-muted-foreground"
            : "fill-primary stroke-primary-edge"
        }
      />
      <text
        y="5"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        className={cn(
          "font-mono",
          station.disabled ? "fill-muted-foreground" : "fill-primary-foreground",
        )}
      >
        {booth.name}
      </text>
      <g transform={`translate(0 ${SPOT_RADIUS + 12})`}>
        <rect x={-width / 2} width={width} height="22" rx="6" className="fill-card stroke-border" />
        <text
          x="0"
          y="16"
          textAnchor="middle"
          fontSize={PILL_FONT}
          fontWeight="600"
          className={cn(
            "font-mono",
            station.disabled ? "fill-muted-foreground" : "fill-card-foreground",
          )}
        >
          {pill}
        </text>
      </g>
    </g>
  );
}
