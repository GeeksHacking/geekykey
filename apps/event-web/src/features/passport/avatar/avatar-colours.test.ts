import { describe, expect, it } from "vitest";

import { BASE } from "@/features/passport/avatar/art";
import {
  DEFAULT_COLOURS,
  HAIR_COLOURS,
  parseColours,
  recolour,
  SKIN_TONES,
  SUIT_COLOURS,
} from "@/features/passport/avatar/avatar-colours";

describe("recolour", () => {
  it("swaps the base body's skin, hair and suit for the guest's choice", () => {
    const deep = SKIN_TONES.find((tone) => tone.key === "deep")!;
    const blonde = HAIR_COLOURS.find((hair) => hair.key === "blonde")!;
    const navy = SUIT_COLOURS.find((suit) => suit.key === "navy")!;

    const out = recolour([BASE.skin, BASE.skinShade, BASE.hair, BASE.suit, BASE.suitShade], {
      skin: "deep",
      hair: "blonde",
      suit: "navy",
    });

    expect(out).toEqual([deep.main, deep.shade, blonde.main, navy.main, navy.shade]);
  });

  it("leaves every other colour and every gap as it was", () => {
    const pixels = [BASE.eyes, BASE.shirt, "#d4af37", null];

    expect(recolour(pixels, { skin: "deep", hair: "grey", suit: "ivory" })).toEqual(pixels);
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
