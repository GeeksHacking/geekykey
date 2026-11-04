import { describe, expect, it } from "vitest";

import { placeWeb } from "@/features/map/place-web";

describe("placeWeb", () => {
  it("draws nothing for an empty web", () => {
    expect(placeWeb([])).toEqual({ nodes: [], edges: [] });
  });

  it("puts each numbered guest on the web once, with its links", () => {
    const web = placeWeb([
      [1, 2],
      [1, 3],
    ]);

    expect(web.nodes.map((node) => node.id)).toEqual([1, 2, 3]);
    expect(web.edges).toHaveLength(2);
    expect(web.edges[0]?.from.id).toBe(1);
    expect(web.edges[0]?.to.id).toBe(2);
    expect(web.edges[1]?.from.id).toBe(1);
    expect(web.edges[1]?.to.id).toBe(3);
  });

  it("keeps every node where it was as the web grows", () => {
    const before = placeWeb([
      [1, 2],
      [2, 3],
    ]);
    const after = placeWeb([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);

    for (const node of before.nodes) {
      expect(after.nodes.find((grown) => grown.id === node.id)).toEqual(node);
    }
    expect(after.nodes).toHaveLength(4);
  });

  it("places a node by its number alone, whatever else is on the web", () => {
    const small = placeWeb([[1, 2]]);
    const large = placeWeb([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ]);

    expect(large.nodes.find((node) => node.id === 1)).toEqual(
      small.nodes.find((node) => node.id === 1),
    );
  });

  it("draws a pair once, whichever way round it arrives, and skips a guest alone", () => {
    const web = placeWeb([
      [1, 2],
      [2, 1],
      [2, 2],
    ]);

    expect(web.nodes.map((node) => node.id)).toEqual([1, 2]);
    expect(web.edges).toHaveLength(1);
  });
});
