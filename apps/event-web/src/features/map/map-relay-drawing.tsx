import { X } from "@phosphor-icons/react";
import { useRef } from "react";

import type { MapRelayResponse } from "@/api/types";
import { useMapRelayAnimations } from "@/features/map/use-map-relay-animations";
import type { RelayView } from "@/features/map/relay";

/** How far "Tap here" sits from the waiting station's centre, beside its square, in plan units. */
const LABEL_GAP = 46;

/**
 * Lines sit below station markers; a square and text distinguish the waiting station. "Tap here"
 * sits beside the square, on the side facing the other relay station, so it stays inside the plan
 * and clear of the booths above and below. Its halo, in the card's colour, keeps the line from
 * cutting through the letters.
 */
export function MapRelayDrawing({ view, data }: { view: RelayView; data?: MapRelayResponse }) {
  const scope = useRef<SVGGElement>(null);
  useMapRelayAnimations(scope, view, data);
  const [from, to] = view.endpoints;
  const waiting = view.waiting;
  const other = view.endpoints.find((item) => item !== waiting);
  const labelRight = !waiting || !other || other.x >= waiting.x;
  return (
    <g ref={scope} aria-hidden data-relay>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth="11" className="stroke-card" />
      <line
        data-relay-line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        strokeWidth="5"
        strokeDasharray={view.state === "running" ? "12 7" : undefined}
        className="stroke-primary-text"
      />
      <circle
        data-relay-transfer
        r="14"
        opacity="0"
        strokeWidth="3"
        className="fill-primary stroke-card"
      />
      <g data-relay-loss opacity="0" className="text-destructive-text">
        <circle r="24" strokeWidth="2" className="fill-card stroke-border" />
        <X x={-18} y={-18} size={36} weight="bold" />
      </g>
      {waiting ? (
        <g data-relay-waiting transform={`translate(${waiting.x} ${waiting.y})`}>
          <rect
            x="-36"
            y="-36"
            width="72"
            height="72"
            rx="5"
            fill="none"
            strokeWidth="5"
            className="stroke-primary-text"
          />
          <text
            x={labelRight ? LABEL_GAP : -LABEL_GAP}
            y="8"
            textAnchor={labelRight ? "start" : "end"}
            fontSize="24"
            fontWeight="700"
            strokeWidth="6"
            paintOrder="stroke"
            strokeLinejoin="round"
            className="fill-foreground stroke-card"
          >
            Tap here
          </text>
        </g>
      ) : null}
    </g>
  );
}
