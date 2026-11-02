import { describe, expect, it } from "vitest";

import { CHARACTERS, type Cell } from "@/features/passport/avatar/art";
import {
  coloursFor,
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

const { suit: man, dress: woman } = CHARACTERS;

describe("recolour", () => {
  it("keeps each character as drawn in their own colours", () => {
    for (const who of [man, woman]) {
      expect(recolour(who.body, coloursFor(who.key))).toEqual(
        who.body.map((cell) => cell?.colour ?? null),
      );
    }
  });

  it("gives the art's own skin, hair and suit colour the guest's choice", () => {
    const deep = SKIN_TONES.find((tone) => tone.key === "deep")!;
    const blonde = HAIR_COLOURS.find((hair) => hair.key === "blonde")!;
    const navy = SUIT_COLOURS.find((suit) => suit.key === "navy")!;
    const cells: Cell[] = [
      { colour: man.base.skin, tag: "skin" },
      { colour: man.base.hair, tag: "hair" },
      { colour: man.base.suit, tag: "suit" },
    ];

    expect(
      recolour(cells, { character: "suit", skin: "deep", hair: "blonde", suit: "navy" }),
    ).toEqual([deep.main, blonde.main, navy.main]);
  });

  it("gives the dress the guest's choice, measured from her own green", () => {
    const navy = SUIT_COLOURS.find((suit) => suit.key === "navy")!;
    const dress: Cell = { colour: woman.base.suit, tag: "suit" };

    expect(recolour([dress], { ...coloursFor("dress"), suit: "navy" })).toEqual([navy.main]);
  });

  it("keeps the art's shading, so a lapel still shows on a dark suit and on a light one", () => {
    const suit: Cell = { colour: man.base.suit, tag: "suit" };
    const lapel: Cell = { colour: "#3e3f3f", tag: "suit" };
    const shadow: Cell = { colour: "#c49273", tag: "skin" };

    for (const choice of ["navy", "ivory"] as const) {
      const [main, edge] = recolour([suit, lapel], { ...DEFAULT_COLOURS, suit: choice });
      expect(edge).not.toBe(main);
    }
    const [skin, shade] = recolour([{ colour: man.base.skin, tag: "skin" }, shadow], {
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

    expect(
      recolour(cells, { character: "suit", skin: "deep", hair: "grey", suit: "ivory" }),
    ).toEqual(["#010001", "#fbfdf7", null]);
  });
});

describe("parseColours", () => {
  it("reads back a saved choice", () => {
    const saved = { character: "dress", skin: "medium", hair: "auburn", suit: "navy" } as const;

    expect(parseColours(JSON.stringify(saved))).toEqual(saved);
  });

  it("falls back to the character in a suit, as drawn, for nothing saved or broken JSON", () => {
    expect(parseColours(null)).toEqual(DEFAULT_COLOURS);
    expect(parseColours("{not json")).toEqual(DEFAULT_COLOURS);
    expect(DEFAULT_COLOURS).toEqual(coloursFor("suit"));
  });

  it("falls back to the character's own colour for an unknown one", () => {
    const saved = JSON.stringify({ character: "dress", skin: "medium", hair: "green", suit: 4 });

    expect(parseColours(saved)).toEqual({ ...coloursFor("dress"), skin: "medium" });
  });
});
