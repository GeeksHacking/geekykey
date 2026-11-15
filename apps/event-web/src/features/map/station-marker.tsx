import { PILL_FONT, pillText, pillWidth, SPOT_RADIUS } from "@/features/map/marker-size";
import type { PlacedStation } from "@/features/map/place-stations";
import { seatText, type SeatMark } from "@/features/map/seat-marks";
import { cn } from "@/lib/utils";

/**
 * Booth names belong to the booth plan so shared stations do not repeat or squeeze them into rings.
 * Counts and open seats sit below each marker. A disabled station says so in words; only an
 * enabled station pulses.
 */
export function StationMarker({ placed, seat }: { placed: PlacedStation; seat?: SeatMark }) {
  const { station, x, y } = placed;
  const pill = pillText(station);
  const width = pillWidth(pill);
  const seatLabel = seat ? seatText(seat) : null;
  const seatLabelWidth = seatLabel ? pillWidth(seatLabel) : 0;

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
      <g transform={`translate(0 ${SPOT_RADIUS + 24})`}>
        <rect x={-width / 2} width={width} height="32" rx="6" className="fill-card stroke-border" />
        <text
          x="0"
          y="24"
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
      {seat && seatLabel ? (
        <g data-open-seat={seat.state} transform={`translate(0 ${SPOT_RADIUS + 62})`}>
          <rect
            x={-seatLabelWidth / 2}
            width={seatLabelWidth}
            height="32"
            rx="6"
            className={
              seat.state === "open"
                ? "fill-primary stroke-primary-edge"
                : "fill-muted stroke-border"
            }
          />
          <text
            x="0"
            y="24"
            textAnchor="middle"
            fontSize={PILL_FONT}
            fontWeight="600"
            className={seat.state === "open" ? "fill-primary-foreground" : "fill-muted-foreground"}
          >
            {seatLabel}
          </text>
        </g>
      ) : null}
    </g>
  );
}
