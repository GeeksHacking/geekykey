import {
  ART_CHARACTERS,
  ART_CHARS,
  ART_PALETTE,
  ART_SIZE,
} from "@/features/passport/avatar/art-data";

/*
  The grad tea's avatar art (FRO-105): Joshua's two characters, one in a suit and one in a
  dress, and each one's pieces, one per stamp slot. The PNGs are in art/avatar/, and
  scripts/avatar-art.ts turns them into art-data.ts. Everything that draws the avatar reads
  this file, so the flat avatar, the cubes and the saved card all change with the art.
*/

export const SIZE = ART_SIZE;

/**
 * Whom a pixel belongs to. The guest's colour choice reaches skin, hair and suit (the dress,
 * on the character in a dress). "item" is a piece itself, and it and an untagged pixel (the
 * shirt, the outline) keep their colour.
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

type CharacterData = (typeof ART_CHARACTERS)[number];
export type CharacterKey = CharacterData["key"];
export type PieceKey = CharacterData["pieces"][number]["key"];

/**
 * How a piece's own pixels sit on the body in 3D: `solid` takes its own rounded shape, like
 * the body (a hat, a cane), and `front` lies on the body's surface (a monocle, pearls).
 */
export type Shape = "solid" | "front";

export interface Piece {
  key: PieceKey;
  label: string;
  shape: Shape;
  layer: Layer;
}

export interface Character {
  key: CharacterKey;
  /** What the picker calls the suit colour on this character. */
  outfit: "Suit" | "Dress";
  body: Art;
  /** In slot order: the first stamp slot gives the first piece. */
  pieces: readonly Piece[];
  /** The art's own skin, hair and suit colours, which the guest's choice replaces. */
  base: { skin: string; hair: string; suit: string };
  /** Rows where the parts start, for the back of the 3D figure. */
  rows: { chin: number; shoes: number };
}

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

/** The colour most of the body's pixels with this tag have. */
function mostCommon(body: Art, tag: Tag): string {
  const counts = new Map<string, number>();
  for (const cell of body) {
    if (cell?.tag === tag) counts.set(cell.colour, (counts.get(cell.colour) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#000000";
}

const LOOK: Record<PieceKey, { label: string; shape: Shape }> = {
  hat: { label: "Hat", shape: "solid" },
  monocle: { label: "Monocle", shape: "front" },
  feather: { label: "Feather", shape: "solid" },
  pearls: { label: "Pearls", shape: "front" },
  cane: { label: "Cane", shape: "solid" },
  glass: { label: "Glass", shape: "solid" },
};

function character(data: CharacterData): Character {
  const body = decode(data.body).map((cell) => (cell === "erase" ? null : cell));
  return {
    key: data.key,
    outfit: data.key === "dress" ? "Dress" : "Suit",
    body,
    pieces: data.pieces.map(({ key, rows }) => ({ key, ...LOOK[key], layer: decode(rows) })),
    base: {
      skin: mostCommon(body, "skin"),
      hair: mostCommon(body, "hair"),
      suit: mostCommon(body, "suit"),
    },
    rows: data.rows,
  };
}

export const CHARACTERS = Object.fromEntries(
  ART_CHARACTERS.map((data) => [data.key, character(data)]),
) as Record<CharacterKey, Character>;

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
