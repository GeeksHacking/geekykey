import { X } from "@phosphor-icons/react";
import { useRef } from "react";

import type { MapRelayResponse } from "@/api/types";
import { useMapRelayAnimations } from "@/features/map/use-map-relay-animations";
import type { RelayView } from "@/features/map/relay";

/** Lines sit below station markers; a square and text distinguish the waiting station. */
export function MapRelayDrawing({ view, data }: { view: RelayView; data?: MapRelayResponse }) {
  const scope = useRef<SVGGElement>(null);
  useMapRelayAnimations(scope, view, data);
  const [from, to] = view.endpoints;
  return (
    <g ref={scope} aria-hidden data-relay>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth="10" className="stroke-card" />
      <line
        data-relay-line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        strokeWidth="4"
        strokeDasharray={view.state === "running" ? "10 6" : undefined}
        className="stroke-primary-text"
      />
      <circle data-relay-transfer r="9" opacity="0" className="fill-primary stroke-primary-edge" />
      <g data-relay-loss opacity="0" className="text-foreground">
        <X x={-14} y={-14} size={28} weight="bold" />
      </g>
      {view.waiting ? (
        <g data-relay-waiting transform={`translate(${view.waiting.x} ${view.waiting.y})`}>
          <rect
            x="-30"
            y="-30"
            width="60"
            height="60"
            rx="4"
            fill="none"
            strokeWidth="4"
            className="stroke-primary-text"
          />
          <text
            y="-40"
            textAnchor="middle"
            fontSize="16"
            fontWeight="700"
            className="fill-foreground"
          >
            Tap here
          </text>
        </g>
      ) : null}
    </g>
  );
}
