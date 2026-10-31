/*
  The grad tea's avatar art (FRO-105). PLACEHOLDER: drawn in code from the prototype until
  Joshua's Sprite Fusion PNGs are ready. They replace BODY and each piece's `pixels` and keep
  this shape: one base body and six pieces, each a transparent layer the same size as the
  base and lined up with it. Everything that draws the avatar reads only this file, so the
  flat avatar, the cubes and the saved card all change with it.
*/

export const SIZE = 32;

/** One pixel per cell, as "#rrggbb", or null where the layer is transparent. */
export type Pixels = (string | null)[];

export type PieceKey = "hat" | "pearls" | "bowtie" | "cane" | "feather" | "glass";

/**
 * How a piece sits on the body in 3D. `cover` replaces the body's cubes where it overlaps
 * (a hat over hair), `front` sits one cube proud of the body (pearls on a jacket).
 */
export type Fit = "cover" | "front";

export interface Piece {
  key: PieceKey;
  label: string;
  fit: Fit;
  /** As cubes: 3 is as thick as the body (5 cubes), 1 is one cube thick, like a stick. */
  depth: 1 | 3;
  pixels: Pixels;
}

/**
 * The base body's colours that the guest's choice swaps (avatar-colours.ts). The real art
 * must use exactly these for skin, hair and suit, or the choice won't reach them.
 */
export const BASE = {
  skin: "#f1c27d",
  skinShade: "#d29f6a",
  hair: "#3b2a1e",
  suit: "#17171c",
  suitShade: "#34344a",
  shirt: "#f4f1e8",
  eyes: "#101014",
  mouth: "#a8584a",
} as const;

const PALETTE: Record<string, string> = {
  K: BASE.suit,
  k: BASE.suitShade,
  W: BASE.shirt,
  S: BASE.skin,
  s: BASE.skinShade,
  H: BASE.hair,
  E: BASE.eyes,
  m: BASE.mouth,
  G: "#d4af37", // gold
  F: "#f7f5ee", // feather
  f: "#c9c3b3", // feather shadow
  P: "#fff3d6", // pearl
  p: "#c8b48e", // pearl shadow
  c: "#6b4226", // cane
  g: "#cfe3ea", // glass
  L: "#f3d36b", // champagne
};

function empty(): Pixels {
  return Array.from({ length: SIZE * SIZE }, () => null);
}

/** The body is symmetric, so it's drawn as left halves and mirrored. */
const BODY_LEFT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "............HHHH",
  "...........HHHHH",
  "...........HHSSS",
  "...........HSESS",
  "...........sSSSS",
  "...........sSSSS",
  "............SSSm",
  ".............SSS",
  "..............sS",
  "..........KKKKWW",
  ".........KKKKKWW",
  ".........KkKKKWW",
  ".........KkKKKKW",
  ".........KkKKKKW",
  ".........KkKKKKK",
  ".........KkKKKKK",
  ".........SkKKKKK",
  ".........SSKKKKK",
  "..........KKKKKK",
  "...........KKKK.",
  "...........KKKK.",
  "...........KkKK.",
  "...........KkKK.",
  "...........KKKK.",
  "..........KKKKK.",
  "................",
  "................",
];

function mirrored(left: string[]): Pixels {
  const out = empty();
  left.forEach((row, y) => {
    const full = row + [...row].reverse().join("");
    [...full].forEach((ch, x) => {
      if (ch !== ".") out[y * SIZE + x] = PALETTE[ch] ?? null;
    });
  });
  return out;
}

/** A piece is a few runs of pixels: [x, y, "chars"], "." skipped. */
function sparse(runs: [number, number, string][]): Pixels {
  const out = empty();
  for (const [x0, y, chars] of runs) {
    [...chars].forEach((ch, i) => {
      if (ch !== ".") out[y * SIZE + x0 + i] = PALETTE[ch] ?? null;
    });
  }
  return out;
}

export const BODY: Pixels = mirrored(BODY_LEFT);

/** Slot order: the first stamp slot gives the hat, and so on. */
export const PIECES: readonly Piece[] = [
  {
    key: "hat",
    label: "Hat",
    fit: "cover",
    depth: 3,
    pixels: sparse([
      [13, 1, "KKKKKK"],
      [12, 2, "KkKKKKKK"],
      [12, 3, "KkKKKKKK"],
      [12, 4, "GGGGGGGG"],
      [10, 5, "KKKKKKKKKKKK"],
    ]),
  },
  {
    key: "pearls",
    label: "Pearls",
    fit: "front",
    depth: 1,
    pixels: sparse([
      [13, 14, "P....P"],
      [13, 15, "p....p"],
      [13, 16, "P....P"],
      [14, 17, "p..p"],
      [14, 18, "P..P"],
      [15, 19, "pp"],
      [15, 20, "PP"],
    ]),
  },
  {
    key: "bowtie",
    label: "Bow tie",
    fit: "front",
    depth: 1,
    pixels: sparse([
      [14, 14, "KkkK"],
      [14, 15, "KKKK"],
    ]),
  },
  {
    key: "cane",
    label: "Cane",
    fit: "cover",
    depth: 1,
    pixels: sparse([
      [8, 19, ".G"],
      [7, 20, "GG"],
      [7, 21, "G"],
      [8, 21, "c"],
      [8, 22, "c"],
      [8, 23, "c"],
      [8, 24, "c"],
      [8, 25, "c"],
      [8, 26, "c"],
      [8, 27, "c"],
      [8, 28, "c"],
      [8, 29, "G"],
    ]),
  },
  {
    key: "feather",
    label: "Feather",
    fit: "cover",
    depth: 1,
    pixels: sparse([
      [22, 0, "F"],
      [21, 1, "FF"],
      [20, 2, "Ff"],
      [20, 3, "F"],
      [20, 4, "f"],
      [20, 5, "f"],
    ]),
  },
  {
    key: "glass",
    label: "Glass",
    fit: "cover",
    depth: 1,
    pixels: sparse([
      [23, 17, "gggg"],
      [23, 18, "gLLg"],
      [24, 19, "gg"],
      [24, 20, "g"],
      [24, 21, "g"],
      [23, 22, "ggg"],
    ]),
  },
];

/** Later layers paint over earlier ones, as a stack of PNGs would. */
export function composite(layers: Pixels[]): Pixels {
  const out = empty();
  for (const layer of layers) {
    layer.forEach((px, i) => {
      if (px) out[i] = px;
    });
  }
  return out;
}
