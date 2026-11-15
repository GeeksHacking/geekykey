import type { MapConnections as MapConnectionsData } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { placeWeb } from "@/features/map/place-web";
import { formatCount } from "@/lib/format";

/**
 * Frame the current extent, with 10 units for the node and 10 for padding. Forty-unit steps
 * avoid a resize on every new participant; the 160 minimum keeps nodes below about 56 px on
 * a 1080p projector. Positions still depend only on node number, but crossing a frame step
 * rescales the web so a larger crowd never clips. The frame changes without animation.
 */
const MIN_WEB_RADIUS = 160;
const FRAME_STEP = 40;

/**
 * The map's anonymous web (FRO-113): the count 9.10 gives and one numbered node per participant.
 * No name, user ID or answer reaches the screen, and no link is marked as new.
 */
export function MapConnections({ connections }: { connections: MapConnectionsData }) {
  const web = placeWeb(connections.links);
  const extent = web.nodes.reduce(
    (radius, node) => Math.max(radius, Math.hypot(node.x, node.y) + 20),
    0,
  );
  const radius = Math.max(MIN_WEB_RADIUS, Math.ceil(extent / FRAME_STEP) * FRAME_STEP);
  const label = connections.count === 1 ? "connection" : "connections";
  const participantWord = web.nodes.length === 1 ? "participant" : "participants";

  return (
    <section
      aria-labelledby="map-connections-heading"
      className="flex min-h-0 min-w-0 flex-col gap-3 lg:col-start-1 lg:row-span-3 lg:row-start-1"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="map-connections-heading" className="type-section">
          Connections
        </h2>
        <span className="look-label text-muted-foreground">Anonymous links</span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <CornerBrackets />
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-4xl font-semibold tabular-nums text-foreground lg:text-5xl">
              {formatCount(connections.count)}
            </span>{" "}
            {label}
          </p>
          {web.nodes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No connections yet. Participants connect by tapping each other's tokens.
            </p>
          ) : (
            <svg
              viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
              role="img"
              aria-label={`A web of ${connections.count} ${label} between ${web.nodes.length} ${participantWord}. No names are shown.`}
              className="mx-auto mt-3 aspect-square w-full lg:aspect-auto lg:min-h-0 lg:flex-1"
            >
              <g aria-hidden>
                {web.edges.map((edge) => (
                  <line
                    key={`${edge.from.id}:${edge.to.id}`}
                    data-web-edge={`${edge.from.id}:${edge.to.id}`}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    // The brand yellow is 1.1:1 on the light theme's card, so the lines
                    // and rings take primary-text there: #706B00, 5.35:1, and the same
                    // yellow as primary on dark (FRO-174). At 75% on light and 60% on
                    // dark, edges stay subordinate to nodes and exceed 3:1.
                    className="stroke-primary-text/75 dark:stroke-primary/60"
                  />
                ))}
                {web.nodes.map((node) => (
                  <g
                    key={node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    data-web-node={node.id}
                  >
                    <circle r="10" strokeWidth="1.5" className="fill-card stroke-primary-text" />
                    <text
                      y="5"
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="600"
                      className="fill-card-foreground font-mono"
                    >
                      {node.id}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}
