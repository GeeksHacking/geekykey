/*
  The anonymous web's layout. A node's place is a pure function of its number, so a poll that
  adds a link cannot move a node that is already there: the server numbers guests in the order
  they first connect (agreement 9.10), and this turns that number into a point on a spiral.
  The numbers stand for guests; the layout never sees a user ID or a name.
*/

/** The angle between one node and the next, so the spiral fills the space evenly. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Plan units between neighbouring nodes near the middle of the web. */
const NODE_SPACING = 24;

export interface WebNode {
  /** The anonymous number the server gave this guest. */
  id: number;
  x: number;
  y: number;
}

export interface WebEdge {
  from: WebNode;
  to: WebNode;
}

export interface PlacedWeb {
  nodes: WebNode[];
  edges: WebEdge[];
}

/** A guest's place, by number alone, so growing the web never moves them. */
function position(id: number): { x: number; y: number } {
  const angle = id * GOLDEN_ANGLE;
  const radius = NODE_SPACING * Math.sqrt(Math.max(id - 1, 0));
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * The web from 9.10's `links`. Each pair is one connection between two numbered guests. A
 * repeated pair is drawn once, whichever way round it arrives, and a guest who is not in any
 * link is not on the web.
 */
export function placeWeb(links: readonly (readonly [number, number])[]): PlacedWeb {
  const pairs = new Map<string, [number, number]>();
  for (const [first, second] of links) {
    if (first === second) continue;
    const pair: [number, number] = first < second ? [first, second] : [second, first];
    pairs.set(`${pair[0]}:${pair[1]}`, pair);
  }

  const ids = [...new Set([...pairs.values()].flat())].sort((a, b) => a - b);
  const nodes = ids.map((id) => ({ id, ...position(id) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const edges: WebEdge[] = [];
  for (const [first, second] of pairs.values()) {
    const from = byId.get(first);
    const to = byId.get(second);
    if (from && to) edges.push({ from, to });
  }

  return { nodes, edges };
}
