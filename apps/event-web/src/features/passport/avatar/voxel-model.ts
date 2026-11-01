import { SIZE, type Cell, type CharacterKey, type PieceKey } from "@/features/passport/avatar/art";
import { VOXEL_FIGURES, VOXEL_PALETTE } from "@/features/passport/avatar/voxel-data";

/*
  The avatar's cubes (FRO-105). Each character's figure is art/avatar/<character>/model.vox,
  which anyone can edit in MagicaVoxel, and scripts/avatar-art.ts copies it into
  voxel-data.ts: the body, and for each piece the cubes it adds and the body's cubes it takes
  away. This file puts a guest's figure together from those parts.
*/

export interface Cube {
  col: number;
  row: number;
  /** 0 is the middle of the figure, and the front is positive. */
  z: number;
  cell: Cell;
}

export interface Figure {
  body: Cube[];
  /** Each worn piece's own cubes, so they can fly in on their own. */
  pieces: { key: PieceKey; cubes: Cube[] }[];
}

const CELLS: Cell[] = VOXEL_PALETTE.map(([colour, tag]) => ({ colour, tag }));

const key = (col: number, row: number, z: number) => (row * SIZE + col) * 256 + z + 128;

function eachRun(
  runs: readonly number[],
  stride: number,
  visit: (col: number, row: number, z: number, entry: number) => void,
) {
  for (let n = 0; n < runs.length; n += stride) {
    const [row, col, z, length, entry = 0] = runs.slice(n, n + stride) as number[];
    for (let k = 0; k < length!; k++) visit(col!, row!, z! + k, entry);
  }
}

/**
 * The cubes a guest shows: the body with each worn piece over it in slot order. Cubes inside
 * the figure, which nobody can see, are left out.
 */
export function figureFor(character: CharacterKey, worn: readonly PieceKey[]): Figure {
  const figure = VOXEL_FIGURES.find((f) => f.key === character);
  const all = new Map<number, { cube: Cube; part: string }>();
  for (const part of figure?.parts ?? []) {
    if (part.key !== "body" && !worn.includes(part.key as PieceKey)) continue;
    eachRun(part.erase, 4, (col, row, z) => all.delete(key(col, row, z)));
    eachRun(part.cubes, 5, (col, row, z, entry) => {
      all.set(key(col, row, z), { cube: { col, row, z, cell: CELLS[entry]! }, part: part.key });
    });
  }
  const shows = ({ col, row, z }: Cube) =>
    !all.has(key(col - 1, row, z)) ||
    !all.has(key(col + 1, row, z)) ||
    !all.has(key(col, row - 1, z)) ||
    !all.has(key(col, row + 1, z)) ||
    !all.has(key(col, row, z - 1)) ||
    !all.has(key(col, row, z + 1));

  const body: Cube[] = [];
  const pieces = new Map<string, Cube[]>();
  for (const { cube, part } of all.values()) {
    if (!shows(cube)) continue;
    if (part === "body") body.push(cube);
    else {
      const list = pieces.get(part);
      if (list) list.push(cube);
      else pieces.set(part, [cube]);
    }
  }
  return {
    body,
    pieces: worn.flatMap((piece) => {
      const cubes = pieces.get(piece);
      return cubes ? [{ key: piece, cubes }] : [];
    }),
  };
}
