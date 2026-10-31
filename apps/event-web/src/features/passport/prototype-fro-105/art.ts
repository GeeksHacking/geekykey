/*
  PROTOTYPE (FRO-105), throwaway. Placeholder pixel art until Joshua's PNGs exist.

  The shape matters more than the drawing: one base body and six pieces, each on its own
  transparent layer of the same size, lined up with the base. A real PNG becomes the same
  `Layer` through `layerFromImage`, so everything downstream (flat, tilt, voxel) is unchanged.
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
  /** For the voxel view: 3 means as thick as the body (5 cubes), 1 means one cube, like a stick. */
  depth: 1 | 3;
  pixels: Pixels;
}

const PALETTE: Record<string, string> = {
  K: "#17171c", // suit
  k: "#34344a", // suit shading
  W: "#f4f1e8", // shirt
  S: "#f1c27d", // skin
  s: "#d29f6a", // skin shadow
  H: "#3b2a1e", // hair
  E: "#101014", // eyes
  m: "#a8584a", // mouth
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
export const PIECES: Piece[] = [
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

/** Later layers paint over earlier ones, as a PNG stack would. */
export function composite(layers: Pixels[]): Pixels {
  const out = empty();
  for (const layer of layers) {
    layer.forEach((px, i) => {
      if (px) out[i] = px;
    });
  }
  return out;
}

/** Draws pixels into a data URL at 1 px per cell. CSS scales it up with `pixelated`. */
export function toDataUrl(pixels: Pixels): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  pixels.forEach((px, i) => {
    if (!px) return;
    ctx.fillStyle = px;
    ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
  });
  return canvas.toDataURL();
}

/** How a real PNG from Joshua would become a layer. Not used by the placeholders. */
export async function layerFromImage(url: string): Promise<Pixels> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return empty();
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  return Array.from({ length: SIZE * SIZE }, (_, i) => {
    if (data[i * 4 + 3]! < 128) return null;
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hex(data[i * 4]!)}${hex(data[i * 4 + 1]!)}${hex(data[i * 4 + 2]!)}`;
  });
}
