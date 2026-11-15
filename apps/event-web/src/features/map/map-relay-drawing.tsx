import { X } from "@phosphor-icons/react";
import { useRef } from "react";

import type { MapRelayResponse } from "@/api/types";
import { WAITING_SIZE, WAITING_STROKE } from "@/features/map/marker-size";
import { useMapRelayAnimations } from "@/features/map/use-map-relay-animations";
import type { RelayView } from "@/features/map/relay";

/** The call follows the waiting square, above its ring and clear of the booth name and pills. */
export function MapRelayDrawing({ view, data }: { view: RelayView; data?: MapRelayResponse }) {
  const scope = useRef<SVGGElement>(null);
  useMapRelayAnimations(scope, view, data);
  const [from, to] = view.endpoints;
  const waiting = view.waiting;
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
      {/* GSAP needs starting coordinates when it restores the transfer after an animation. */}
      <circle
        data-relay-transfer
        cx="0"
        cy="0"
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
            x={-WAITING_SIZE / 2}
            y={-WAITING_SIZE / 2}
            width={WAITING_SIZE}
            height={WAITING_SIZE}
            rx="5"
            fill="none"
            strokeWidth={WAITING_STROKE}
            className="stroke-primary-text"
          />
          <text
            x={waiting.x > waiting.booth.x ? 36 : waiting.x < waiting.booth.x ? -36 : 0}
            y="-48"
            textAnchor={
              waiting.x > waiting.booth.x ? "end" : waiting.x < waiting.booth.x ? "start" : "middle"
            }
            fontSize="34"
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
