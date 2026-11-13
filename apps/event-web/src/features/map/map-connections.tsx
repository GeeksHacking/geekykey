import type { MapConnections as MapConnectionsData } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { placeWeb } from "@/features/map/place-web";
import { formatCount } from "@/lib/format";

/**
 * How much room the spiral takes, in plan units. It fits the crowd the showcase expects, so a
 * node keeps its place on screen as the web grows; a much larger event clips the outer nodes.
 */
const WEB_RADIUS = 210;

/**
 * The map's anonymous web (FRO-113): the count 9.10 gives and one numbered node per guest.
 * No name, user ID or answer reaches the screen, and no link is marked as new.
 */
export function MapConnections({ connections }: { connections: MapConnectionsData }) {
  const web = placeWeb(connections.links);
  const label = connections.count === 1 ? "connection" : "connections";
  const guests = web.nodes.length === 1 ? "guest" : "guests";

  return (
    <section aria-labelledby="map-connections-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="map-connections-heading" className="type-section">
          Connections
        </h2>
        <span className="look-label text-muted-foreground">Anonymous links</span>
      </div>
      <div className="relative">
        <CornerBrackets />
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
              {formatCount(connections.count)}
            </span>{" "}
            {label}
          </p>
          {web.nodes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No connections yet. Guests connect by tapping each other's tokens.
            </p>
          ) : (
            <svg
              viewBox={`${-WEB_RADIUS} ${-WEB_RADIUS} ${WEB_RADIUS * 2} ${WEB_RADIUS * 2}`}
              role="img"
              aria-label={`A web of ${connections.count} ${label} between ${web.nodes.length} ${guests}. No names are shown.`}
              className="mx-auto mt-3 h-auto w-full"
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
                    strokeWidth="1.5"
                    // The brand yellow is 1.1:1 on the light theme's card, so the lines
                    // and rings take primary-text there: #706B00, 5.35:1, and the same
                    // yellow as primary on dark (FRO-174). The lines sit at 75% to stay
                    // subordinate to the nodes and still reach 3:1.
                    className="stroke-primary-text/75 dark:stroke-primary/30"
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
