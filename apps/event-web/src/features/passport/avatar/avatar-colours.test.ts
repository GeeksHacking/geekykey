import { describe, expect, it } from "vitest";

import { BASE, BODY, type Cell } from "@/features/passport/avatar/art";
import {
  DEFAULT_COLOURS,
  HAIR_COLOURS,
  parseColours,
  recolour,
  SKIN_TONES,
  SUIT_COLOURS,
} from "@/features/passport/avatar/avatar-colours";

const lightness = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
};

describe("recolour", () => {
  it("keeps the art as drawn for the default colours", () => {
    expect(recolour(BODY, DEFAULT_COLOURS)).toEqual(BODY.map((cell) => cell?.colour ?? null));
  });

  it("gives the art's own skin, hair and suit colour the guest's choice", () => {
    const deep = SKIN_TONES.find((tone) => tone.key === "deep")!;
    const blonde = HAIR_COLOURS.find((hair) => hair.key === "blonde")!;
    const navy = SUIT_COLOURS.find((suit) => suit.key === "navy")!;
    const cells: Cell[] = [
      { colour: BASE.skin, tag: "skin" },
      { colour: BASE.hair, tag: "hair" },
      { colour: BASE.suit, tag: "suit" },
    ];

    expect(recolour(cells, { skin: "deep", hair: "blonde", suit: "navy" })).toEqual([
      deep.main,
      blonde.main,
      navy.main,
    ]);
  });

  it("keeps the art's shading, so a lapel still shows on a dark suit and on a light one", () => {
    const suit: Cell = { colour: BASE.suit, tag: "suit" };
    const lapel: Cell = { colour: "#3e3f3f", tag: "suit" };
    const shadow: Cell = { colour: "#c49273", tag: "skin" };

    for (const choice of ["navy", "ivory"] as const) {
      const [main, edge] = recolour([suit, lapel], { ...DEFAULT_COLOURS, suit: choice });
      expect(edge).not.toBe(main);
    }
    const [skin, shade] = recolour([{ colour: BASE.skin, tag: "skin" }, shadow], {
      ...DEFAULT_COLOURS,
      skin: "light",
    });
    expect(lightness(shade!)).toBeLessThan(lightness(skin!));
  });

  it("leaves a piece, an untagged pixel and a gap as they were", () => {
    const cells = [
      { colour: "#010001", tag: "item" },
      { colour: "#fbfdf7", tag: null },
      null,
    ] satisfies (Cell | null)[];

    expect(recolour(cells, { skin: "deep", hair: "grey", suit: "ivory" })).toEqual([
      "#010001",
      "#fbfdf7",
      null,
    ]);
  });
});

describe("parseColours", () => {
  it("reads back a saved choice", () => {
    const saved = JSON.stringify({ skin: "medium", hair: "auburn", suit: "emerald" });

    expect(parseColours(saved)).toEqual({ skin: "medium", hair: "auburn", suit: "emerald" });
  });

  it("falls back to the default for nothing saved, broken JSON or an unknown key", () => {
    expect(parseColours(null)).toEqual(DEFAULT_COLOURS);
    expect(parseColours("{not json")).toEqual(DEFAULT_COLOURS);
    expect(parseColours(JSON.stringify({ skin: "medium", hair: "green", suit: 4 }))).toEqual({
      ...DEFAULT_COLOURS,
      skin: "medium",
    });
  });
});
