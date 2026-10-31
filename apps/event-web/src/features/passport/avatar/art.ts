import {
  ART_BODY,
  ART_CHARS,
  ART_PALETTE,
  ART_PIECES,
  ART_SIZE,
} from "@/features/passport/avatar/art-data";

/*
  The grad tea's avatar art (FRO-105): Joshua's character and one piece per stamp slot. The
  PNGs are in art/avatar/, and scripts/avatar-art.ts turns them into art-data.ts. Everything
  that draws the avatar reads this file, so the flat avatar, the cubes and the saved card all
  change with the art.
*/

export const SIZE = ART_SIZE;

/**
 * Whom a pixel belongs to. The guest's colour choice reaches skin, hair and suit. "item" is
 * a piece itself, and it and an untagged pixel (the shirt, the shoes, the outline) keep their
 * colour.
 */
export type Tag = (typeof ART_PALETTE)[number][1];

export interface Cell {
  colour: string;
  tag: Tag;
}

/** One cell per pixel, row by row, or null where it's transparent. */
export type Art = (Cell | null)[];

/** Colours ready to paint, one per pixel, or null where it's transparent. */
export type Pixels = (string | null)[];

/**
 * A piece over the body. A cell paints, "erase" clears the body under it (the arm that lifts
 * to hold the glass leaves the side), and null leaves the body as it is.
 */
export type Layer = (Cell | "erase" | null)[];

export type PieceKey = (typeof ART_PIECES)[number]["key"];

/**
 * How a piece's own pixels sit on the body in 3D: `solid` is as thick as the body (a hat over
 * hair), `front` is one cube in front of it (a monocle), `thin` is one cube thick (a cane).
 */
export type Shape = "solid" | "front" | "thin";

export interface Piece {
  key: PieceKey;
  label: string;
  shape: Shape;
  layer: Layer;
}

/** Rows of the grid where the character's parts start, for the back of the 3D figure. */
export const ROWS = { chin: 20, shoes: 56 } as const;

const CELLS: Cell[] = ART_PALETTE.map(([colour, tag]) => ({ colour, tag }));

function decode(rows: readonly string[]): Layer {
  return rows.flatMap((row) =>
    [...row].map((char) => {
      if (char === ".") return null;
      if (char === "_") return "erase";
      return CELLS[ART_CHARS.indexOf(char)] ?? null;
    }),
  );
}

export const BODY: Art = decode(ART_BODY).map((cell) => (cell === "erase" ? null : cell));

/** The colour most of the body's pixels with this tag have, which the guest's choice replaces. */
function mostCommon(tag: Tag): string {
  const counts = new Map<string, number>();
  for (const cell of BODY) {
    if (cell?.tag === tag) counts.set(cell.colour, (counts.get(cell.colour) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#000000";
}

/** The art's own skin, hair and suit colours. */
export const BASE = {
  skin: mostCommon("skin"),
  hair: mostCommon("hair"),
  suit: mostCommon("suit"),
} as const;

const LOOK: Record<PieceKey, { label: string; shape: Shape }> = {
  hat: { label: "Hat", shape: "solid" },
  monocle: { label: "Monocle", shape: "front" },
  cane: { label: "Cane", shape: "thin" },
  glass: { label: "Glass", shape: "thin" },
};

/** Slot order: the first stamp slot gives the hat, and so on. */
export const PIECES: readonly Piece[] = ART_PIECES.map(({ key, rows }) => ({
  key,
  ...LOOK[key],
  layer: decode(rows),
}));

/** The body with each layer over it in turn, as a stack of PNGs would be. */
export function composite(body: Art, layers: readonly Layer[]): Art {
  const out = [...body];
  for (const layer of layers) {
    layer.forEach((cell, i) => {
      if (cell === "erase") out[i] = null;
      else if (cell) out[i] = cell;
    });
  }
  return out;
}
