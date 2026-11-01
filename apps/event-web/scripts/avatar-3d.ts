/**
 * The avatar's 3D figures (FRO-105), for scripts/avatar-art.ts.
 *
 * Each character's figure is art/avatar/<character>/model.vox, a MagicaVoxel file with one
 * model per part, all in the same 64 x 32 x 64 frame so they line up:
 *
 * - "body", the character with no pieces on;
 * - one per piece, named after it ("hat", "cane"), which the guest wears over the body;
 * - "<piece> erase", hidden in the editor, for the body's cubes a piece takes away when it's
 *   worn (the arm that lifts to hold the glass, the hair under the hat). Its colour is ignored.
 *
 * The first run builds model.vox from the PNGs, rounding each pixel into a column of cubes.
 * After that the file is the figure, so an edit made in MagicaVoxel stays. Where a colour sits
 * in the palette says what the guest's colour choice reaches (TAG_RANGES).
 */
import { readFileSync } from "node:fs";

export const SIZE = 64;
/** Every model is this many cubes deep. z runs from BACK to FRONT, and 0 is the middle. */
export const DEPTH = 32;
const FRONT = DEPTH / 2 - 1;
const BACK = FRONT - DEPTH + 1;

export type Tag = "skin" | "hair" | "suit" | "item" | null;
export type Entry = readonly [hex: string, tag: Tag];

/**
 * Which palette slots (MagicaVoxel's colour index, 1 to 255) take the guest's choice. A cube
 * painted with any colour from a range is recoloured as that part, so a new colour goes in
 * the range of the part it belongs to.
 */
export const TAG_RANGES: readonly { tag: Tag; from: number; to: number; name: string }[] = [
  { tag: "skin", from: 1, to: 47, name: "skin" },
  { tag: "hair", from: 48, to: 79, name: "hair" },
  { tag: "suit", from: 80, to: 127, name: "suit or dress" },
  { tag: "item", from: 128, to: 191, name: "the pieces" },
  { tag: null, from: 192, to: 247, name: "everything else, which keeps its colour" },
];
const ERASE_INDEX = 255;

export const tagOf = (index: number): Tag =>
  TAG_RANGES.find((r) => index >= r.from && index <= r.to)?.tag ?? null;

/** One number per cube position, so a Map can hold a part. */
export const key = (col: number, row: number, z: number) => (row * SIZE + col) * 256 + z + 128;
export const unkey = (k: number) => ({
  col: Math.floor(k / 256) % SIZE,
  row: Math.floor(k / 256 / SIZE),
  z: (k % 256) - 128,
});
const columnOf = (k: number) => Math.floor(k / 256);

export interface Part {
  key: string;
  /** Position to palette slot. */
  cubes: Map<number, number>;
  /** The body's cubes this piece takes away. Always empty on the body. */
  erase: Set<number>;
}

export interface Model {
  /** By palette slot, 1 to 255. */
  palette: (Entry | undefined)[];
  /** The body first, then each piece in slot order. */
  parts: Part[];
}

/** The flat art one character is built from, as avatar-art.ts reads it. */
export interface Drawing {
  key: string;
  rows: { chin: number; shoes: number };
  entries: readonly Entry[];
  /** An index into `entries` per pixel, or null where it's transparent. */
  body: readonly (number | null)[];
  pieces: readonly {
    key: string;
    /** It lies on the body's surface (a monocle, pearls) rather than taking its own shape. */
    front: boolean;
    layer: readonly (number | "erase" | null)[];
  }[];
}

// ---------------------------------------------------------------------------------------
// From the flat art to cubes.

/** The most cubes either side of the middle: a round head, and a body with a flat front. */
const HEAD_HALF = 6;
const BODY_HALF = 5;
/** Hands, bare arms and legs, and the neck, are flatter than they are wide. */
const LIMB_HALF = 2;

const channels = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const luma = (hex: string) => {
  const [r, g, b] = channels(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const chroma = (hex: string) => Math.max(...channels(hex)) - Math.min(...channels(hex));

/** Dark enough to be a line the art draws round something. */
const LINE = 48;

interface Shape {
  /** Half the figure's thickness at each pixel, or -1 where there's no pixel. */
  half: number[];
  /** The pixel is part of a hand, a bare arm or leg, or the neck, with its outline. */
  limb: boolean[];
}

/**
 * How thick the figure is at each pixel. Each run of pixels across a row is cut as a circle,
 * and each run down a column rounds off the top of the head and the shoulders. Across a row,
 * a piece (the cane, the glass) is cut on its own, and below the chin so is skin at either
 * end of a run, with its outline: a hand, or an arm by the side. So a hand holding the cane
 * doesn't swell into one block with it, and a bare arm drawn against the dress comes out
 * round instead of as deep as the torso.
 */
function shapeOf(art: readonly (number | null)[], d: Drawing): Shape {
  const across = Array.from({ length: SIZE * SIZE }, () => -1);
  const down = Array.from({ length: SIZE * SIZE }, () => -1);
  const limb = Array.from({ length: SIZE * SIZE }, () => false);
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && art[y * SIZE + x] != null;
  const entry = (x: number, y: number) => d.entries[art[y * SIZE + x]!]!;
  const isSkin = (x: number, y: number) => solid(x, y) && entry(x, y)[1] === "skin";
  // A dark line next to skin is the skin's outline. The suit's own black only counts beside
  // skin on the same row, so the cuff above a hand stays sleeve.
  const skinny = (x: number, y: number) => {
    const [hex, tag] = entry(x, y);
    if (tag === "skin") return true;
    if (tag === "item" || luma(hex) >= LINE) return false;
    if (isSkin(x - 1, y) || isSkin(x + 1, y)) return true;
    return tag === null && (isSkin(x, y - 1) || isSkin(x, y + 1));
  };
  const round = (
    out: number[],
    at: (j: number) => number,
    from: number,
    to: number,
    cap: number,
  ) => {
    const r = (to - from + 1) / 2;
    const middle = (from + to) / 2;
    for (let j = from; j <= to; j++) {
      out[at(j)] = Math.min(Math.sqrt(Math.max(r * r - (j - middle) ** 2, 0)), cap);
    }
  };
  /** A row's run cut into pieces, and limbs at either end, each with its cap. */
  const segments = (y: number, from: number, to: number) => {
    const body = y < d.rows.chin ? HEAD_HALF : BODY_HALF;
    const out: { from: number; to: number; cap: number; limb: boolean }[] = [];
    let k = from;
    while (k <= to) {
      const item = entry(k, y)[1] === "item";
      let end = k;
      while (end + 1 <= to && (entry(end + 1, y)[1] === "item") === item) end++;
      if (item || y < d.rows.chin) out.push({ from: k, to: end, cap: body, limb: false });
      else {
        let a = k;
        while (a <= end && skinny(a, y)) a++;
        if (a > end) out.push({ from: k, to: end, cap: LIMB_HALF, limb: true });
        else {
          let b = end;
          while (skinny(b, y)) b--;
          if (a > k) out.push({ from: k, to: a - 1, cap: LIMB_HALF, limb: true });
          out.push({ from: a, to: b, cap: body, limb: false });
          if (b < end) out.push({ from: b + 1, to: end, cap: LIMB_HALF, limb: true });
        }
      }
      k = end + 1;
    }
    return out;
  };
  for (let line = 0; line < SIZE; line++) {
    for (const isRow of [true, false]) {
      let k = 0;
      while (k < SIZE) {
        if (!(isRow ? solid(k, line) : solid(line, k))) {
          k++;
          continue;
        }
        let end = k;
        while (end + 1 < SIZE && (isRow ? solid(end + 1, line) : solid(line, end + 1))) end++;
        if (isRow) {
          for (const seg of segments(line, k, end)) {
            round(across, (j) => line * SIZE + j, seg.from, seg.to, seg.cap);
            for (let j = seg.from; j <= seg.to; j++) limb[line * SIZE + j] = seg.limb;
          }
        } else round(down, (j) => j * SIZE + line, k, end, Infinity);
        k = end + 1;
      }
    }
  }
  const half = across.map((a, i) => (a < 0 ? -1 : Math.floor(Math.min(a, down[i]!))));
  return { half, limb };
}

/** The entry with this tag that most of the body's pixels have. */
function mostCommon(d: Drawing, tag: Tag): number {
  const counts = new Map<number, number>();
  for (const cell of d.body) {
    if (cell !== null && d.entries[cell]![1] === tag) counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (!best) throw new Error(`${d.key}: the body has no pixel tagged ${tag}`);
  return best[0];
}

/** For each pixel, the entry its column shows on the front and on the back, or -1. */
function surfaces(d: Drawing, art: readonly (number | null)[], { half, limb }: Shape) {
  const entry = (i: number) => d.entries[art[i]!]!;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && art[y * SIZE + x] != null;
  const around = (i: number) => {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    return [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const;
  };
  const onRim = (i: number) => around(i).some(([x, y]) => !solid(x, y));
  // The flat art draws its edges with a dark outline. The cubes have real edges, so the
  // outline takes the colour of the pixel inside it, or it shows as lines down the arms,
  // round the hands and, where the figure is one cube thick, from behind. The eyes (black, on
  // the head), the lips (not dark enough), the lines between fingers and the shoes keep
  // their colour.
  const isOutline = (i: number) => {
    const [hex, tag] = entry(i);
    const row = Math.floor(i / SIZE);
    const body = row >= d.rows.chin && row < d.rows.shoes;
    if (tag === null && luma(hex) < 16 && (chroma(hex) > 8 || body)) return true;
    if (tag === "item" || !body) return false;
    // The edge of a hand or a bare arm.
    if (limb[i] && tag !== "skin" && luma(hex) < LINE) {
      return around(i).some(([x, y]) => !solid(x, y) || !limb[y * SIZE + x]);
    }
    // A rim darker than what it edges, like the dress's dark green edge.
    if (!onRim(i)) return false;
    const inside = around(i)
      .filter(([x, y]) => solid(x, y) && !onRim(y * SIZE + x))
      .map(([x, y]) => luma(entry(y * SIZE + x)[0]));
    return inside.length > 0 && luma(hex) < 0.6 * Math.max(...inside);
  };
  // A hand's outline takes the hand's colour, and nothing takes a piece's colour unless
  // there's nothing else near it, so skin doesn't bleed into the cane, nor the cane into skin.
  const fill = (i: number) => {
    if (!isOutline(i)) return art[i]!;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    const fits = [(j: number) => (limb[i] ? limb[j]! : true) && entry(j)[1] !== "item", () => true];
    for (const fit of fits) {
      for (const reach of [1, 2]) {
        let best: number | undefined;
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            if (!solid(x + dx, y + dy)) continue;
            const j = (y + dy) * SIZE + x + dx;
            if (isOutline(j) || !fit(j)) continue;
            if (best === undefined || half[j]! > half[best]!) best = j;
          }
        }
        if (best !== undefined) return art[best]!;
      }
    }
    return art[i]!;
  };
  const hair = mostCommon(d, "hair");
  const suit = mostCommon(d, "suit");
  // Something held in the fingers, like the glass's foot, isn't the jacket's back.
  const nearSkin = (i: number) => {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (solid(x + dx, y + dy) && limb[(y + dy) * SIZE + x + dx]) return true;
      }
    }
    return false;
  };
  const front = art.map((cell, i) => (cell === null ? -1 : fill(i)));
  // The back of the head is hair, and the back of the jacket or dress is plain, with no
  // shirt or lapels. Hands, bare arms, shoes and the pieces look the same from behind.
  const back = front.map((cell, i) => {
    if (cell < 0) return -1;
    const tag = d.entries[cell]![1];
    const row = Math.floor(i / SIZE);
    if (tag === "item" || (limb[i] && row >= d.rows.chin)) return cell;
    if (row < d.rows.chin) return hair;
    if (tag === "skin" || row >= d.rows.shoes) return cell;
    if (tag === null && nearSkin(i)) return cell;
    return suit;
  });
  return { front, back };
}

/** Gives each entry a palette slot in its tag's range. */
function paletteFor(entries: readonly Entry[]) {
  const palette: (Entry | undefined)[] = [];
  const toSlot = entries.map((entry) => slotFor(palette, entry));
  return { palette, toSlot };
}

/** The slot this entry has in the palette, or a free one in its tag's range. */
function slotFor(palette: (Entry | undefined)[], [hex, tag]: Entry): number {
  const range = TAG_RANGES.find((r) => r.tag === tag)!;
  for (let k = range.from; k <= range.to; k++) {
    const seen = palette[k];
    if (seen?.[0] === hex) return k;
    if (!seen) {
      palette[k] = [hex, tag];
      return k;
    }
  }
  throw new Error(`More than ${range.to - range.from + 1} colours for ${range.name}`);
}

/** The figure as the flat art draws it, before anyone edits it. */
export function generate(d: Drawing): Model {
  const { palette, toSlot } = paletteFor(d.entries);
  const column = (
    half: readonly number[],
    colours: { front: number[]; back: number[] },
    i: number,
    out: Map<number, number>,
  ) => {
    const col = i % SIZE;
    const row = Math.floor(i / SIZE);
    for (let z = -half[i]!; z <= half[i]!; z++) {
      out.set(key(col, row, z), toSlot[z >= 0 ? colours.front[i]! : colours.back[i]!]!);
    }
  };

  const bodyShape = shapeOf(d.body, d);
  const half = bodyShape.half;
  const bodyColours = surfaces(d, d.body, bodyShape);
  const body: Part = { key: "body", cubes: new Map(), erase: new Set() };
  d.body.forEach((cell, i) => {
    if (cell !== null) column(half, bodyColours, i, body.cubes);
  });

  const pieces = d.pieces.map((piece) => {
    // Each piece is rounded with the body it's worn on, so a cane held against the side
    // rounds with the arm holding it.
    const art = d.body.map((cell, i) => {
      const over = piece.layer[i];
      return over === "erase" ? null : (over ?? cell);
    });
    const ownShape = shapeOf(art, d);
    const ownHalf = ownShape.half;
    const colours = surfaces(d, art, ownShape);
    const part: Part = { key: piece.key, cubes: new Map(), erase: new Set() };
    piece.layer.forEach((cell, i) => {
      if (cell === null) return;
      const col = i % SIZE;
      const row = Math.floor(i / SIZE);
      const bodyHalf = d.body[i] === null ? -1 : half[i]!;
      if (cell === "erase") {
        for (let z = -bodyHalf; z <= bodyHalf; z++) part.erase.add(key(col, row, z));
        return;
      }
      // A monocle sits one cube in front of the face, and the face stays whole under it.
      if (piece.front && d.entries[cell]![1] === "item" && bodyHalf >= 0) {
        part.cubes.set(key(col, row, bodyHalf + 1), toSlot[cell]!);
        return;
      }
      // Anything else takes the body's place in its column.
      column(ownHalf, colours, i, part.cubes);
      for (let z = -bodyHalf; z <= bodyHalf; z++) {
        if (Math.abs(z) > ownHalf[i]!) part.erase.add(key(col, row, z));
      }
    });
    return part;
  });

  return { palette, parts: [body, ...pieces] };
}

/** The cubes a guest wearing `worn` shows, and which part each comes from. */
export function compose(model: Model, worn: readonly string[]) {
  const out = new Map<number, { slot: number; part: string }>();
  const [body, ...pieces] = model.parts;
  for (const [k, slot] of body!.cubes) out.set(k, { slot, part: "body" });
  for (const piece of pieces.filter((p) => worn.includes(p.key))) {
    for (const k of piece.erase) out.delete(k);
    for (const [k, slot] of piece.cubes) out.set(k, { slot, part: piece.key });
  }
  return out;
}

/** Body columns in the flat art with no cubes, and columns with cubes but no pixel. */
export function columnsOff(model: Model, d: Drawing) {
  const columns = new Set([...model.parts[0]!.cubes.keys()].map(columnOf));
  let off = 0;
  for (let i = 0; i < SIZE * SIZE; i++) if ((d.body[i] !== null) !== columns.has(i)) off++;
  return off;
}

// ---------------------------------------------------------------------------------------
// MagicaVoxel files. The format: https://github.com/ephtracy/voxel-model/tree/master

const int = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
const text = (s: string) => Buffer.concat([int(Buffer.byteLength(s)), Buffer.from(s)]);
const dict = (o: Record<string, string>) =>
  Buffer.concat([
    int(Object.keys(o).length),
    ...Object.entries(o).flatMap(([k, v]) => [text(k), text(v)]),
  ]);
const chunk = (id: string, content: Buffer, children: Buffer = Buffer.alloc(0)) =>
  Buffer.concat([
    Buffer.from(id, "ascii"),
    int(content.length),
    int(children.length),
    content,
    children,
  ]);

export function writeVox(model: Model): Buffer {
  const models = model.parts.flatMap((part, n) => [
    { name: part.key, cubes: [...part.cubes], hidden: false },
    ...(n === 0
      ? []
      : [
          {
            name: `${part.key} erase`,
            cubes: [...part.erase].map((k): [number, number] => [k, ERASE_INDEX]),
            hidden: true,
          },
        ]),
  ]);
  const shapes = models.flatMap(({ name, cubes }) => {
    const xyzi = Buffer.alloc(4 + 4 * cubes.length);
    xyzi.writeInt32LE(cubes.length);
    cubes.forEach(([k, slot], n) => {
      const { col, row, z } = unkey(k);
      if (z < BACK || z > FRONT) throw new Error(`${name}: a cube at z ${z} is outside the frame`);
      // MagicaVoxel is z up, and its front view looks along +y.
      xyzi.set([col, FRONT - z, SIZE - 1 - row, slot], 4 + 4 * n);
    });
    return [chunk("SIZE", Buffer.concat([int(SIZE), int(DEPTH), int(SIZE)])), chunk("XYZI", xyzi)];
  });
  const scene = [
    chunk("nTRN", Buffer.concat([int(0), dict({}), int(1), int(-1), int(-1), int(1), dict({})])),
    chunk(
      "nGRP",
      Buffer.concat([
        int(1),
        dict({}),
        int(models.length),
        ...models.map((_, n) => int(2 + 2 * n)),
      ]),
    ),
    ...models.flatMap(({ name, hidden }, n) => [
      chunk(
        "nTRN",
        Buffer.concat([
          int(2 + 2 * n),
          dict(hidden ? { _name: name, _hidden: "1" } : { _name: name }),
          int(3 + 2 * n),
          int(-1),
          int(0),
          int(1),
          dict({}),
        ]),
      ),
      chunk("nSHP", Buffer.concat([int(3 + 2 * n), dict({}), int(1), int(n), dict({})])),
    ]),
    chunk("LAYR", Buffer.concat([int(0), dict({}), int(-1)])),
  ];
  // Entry k is colour slot k + 1. Unused slots are white, and the erase slot magenta.
  const rgba = Buffer.alloc(256 * 4, 255);
  for (let slot = 1; slot < 256; slot++) {
    const entry = slot === ERASE_INDEX ? (["#ff00ff", null] as const) : model.palette[slot];
    if (entry) rgba.set([...channels(entry[0]), 255], (slot - 1) * 4);
  }
  const children = Buffer.concat([...shapes, ...scene, chunk("RGBA", rgba)]);
  return Buffer.concat([Buffer.from("VOX "), int(150), chunk("MAIN", Buffer.alloc(0), children)]);
}

interface VoxNode {
  attrs: Record<string, string>;
  frame?: Record<string, string>;
  children: number[];
  models: number[];
}

export function readVox(buf: Buffer, file: string, pieceKeys: readonly string[]): Model {
  if (buf.toString("ascii", 0, 4) !== "VOX ") throw new Error(`${file}: not a MagicaVoxel file`);
  let at = 8;
  const read = {
    int: () => {
      at += 4;
      return buf.readInt32LE(at - 4);
    },
    text: () => {
      const n = read.int();
      at += n;
      return buf.toString("utf8", at - n, at);
    },
    dict: () => {
      const out: Record<string, string> = {};
      for (let n = read.int(); n > 0; n--) out[read.text()] = read.text();
      return out;
    },
  };
  at = 20 + buf.readInt32LE(12);
  const end = at + buf.readInt32LE(16);
  const sizes: [number, number, number][] = [];
  const voxels: Buffer[] = [];
  const nodes = new Map<number, VoxNode>();
  let rgba: Buffer | undefined;
  while (at < end) {
    const id = buf.toString("ascii", at, at + 4);
    const length = buf.readInt32LE(at + 4);
    const next = at + 12 + length + buf.readInt32LE(at + 8);
    at += 12;
    if (id === "SIZE") sizes.push([read.int(), read.int(), read.int()]);
    if (id === "XYZI") voxels.push(buf.subarray(at + 4, at + 4 + 4 * buf.readInt32LE(at)));
    if (id === "RGBA") rgba = buf.subarray(at, at + 1024);
    if (id === "nTRN") {
      const nodeId = read.int();
      const attrs = read.dict();
      const child = read.int();
      read.int();
      read.int();
      const frames = read.int();
      nodes.set(nodeId, {
        attrs,
        frame: frames > 0 ? read.dict() : {},
        children: [child],
        models: [],
      });
    }
    if (id === "nGRP") {
      const nodeId = read.int();
      const attrs = read.dict();
      const children = Array.from({ length: read.int() }, () => read.int());
      nodes.set(nodeId, { attrs, children, models: [] });
    }
    if (id === "nSHP") {
      const nodeId = read.int();
      const attrs = read.dict();
      const models = Array.from({ length: read.int() }, () => {
        const model = read.int();
        read.dict();
        return model;
      });
      nodes.set(nodeId, { attrs, children: [], models });
    }
    at = next;
  }
  if (!rgba) throw new Error(`${file}: it has no palette. Save it from MagicaVoxel again.`);

  // Where each model sits, and its name, from the scene the editor saved.
  const placed: { model: number; name: string; t: [number, number, number] }[] = [];
  const walk = (id: number, t: [number, number, number], name: string) => {
    const node = nodes.get(id);
    if (!node) return;
    let here = t;
    let called = name;
    if (node.frame) {
      const [x = 0, y = 0, z = 0] = (node.frame._t ?? "0 0 0").split(" ").map(Number);
      here = [t[0] + x, t[1] + y, t[2] + z];
      called = node.attrs._name ?? name;
      if (node.frame._r && node.frame._r !== "4") {
        console.warn(`${file}: "${called}" is rotated, and the rotation is ignored`);
      }
    }
    for (const child of node.children) walk(child, here, called);
    for (const model of node.models) placed.push({ model, name: called, t: here });
  };
  if (nodes.size > 0) walk(0, [0, 0, 0], "");
  else
    voxels.forEach((_, model) =>
      placed.push({ model, name: model === 0 ? "body" : "", t: [0, 0, 0] }),
    );

  const palette: (Entry | undefined)[] = [];
  const parts: Part[] = ["body", ...pieceKeys].map((k) => ({
    key: k,
    cubes: new Map(),
    erase: new Set(),
  }));
  let outside = 0;
  for (const { model, name, t } of placed) {
    const erase = name.endsWith(" erase");
    const part = parts.find((p) => p.key === (erase ? name.slice(0, -" erase".length) : name));
    if (!part || (erase && part.key === "body")) {
      console.warn(
        `${file}: a model called "${name}" isn't a part of this character, so it's left out`,
      );
      continue;
    }
    const [sx, sy, sz] = sizes[model]!;
    const data = voxels[model]!;
    for (let n = 0; n < data.length; n += 4) {
      // MagicaVoxel puts a model's middle at its position.
      const col = data[n]! + t[0] - Math.floor(sx / 2) + SIZE / 2;
      const vy = data[n + 1]! + t[1] - Math.floor(sy / 2) + DEPTH / 2;
      const vz = data[n + 2]! + t[2] - Math.floor(sz / 2) + SIZE / 2;
      const slot = data[n + 3]!;
      if (col < 0 || col >= SIZE || vz < 0 || vz >= SIZE || vy < 0 || vy >= DEPTH) {
        outside++;
        continue;
      }
      const k = key(col, SIZE - 1 - vz, FRONT - vy);
      if (erase) {
        part.erase.add(k);
        continue;
      }
      part.cubes.set(k, slot);
      if (!palette[slot]) {
        const [r, g, b] = rgba.subarray((slot - 1) * 4, slot * 4);
        palette[slot] = [
          `#${[r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("")}`,
          tagOf(slot),
        ];
      }
    }
  }
  if (outside > 0)
    console.warn(`${file}: ${outside} cubes are outside the 64 x 32 x 64 frame and are left out`);
  for (const part of parts) {
    if (part.cubes.size === 0)
      console.warn(`${file}: "${part.key}" has no cubes, so it won't show`);
  }
  return { palette, parts };
}

// ---------------------------------------------------------------------------------------
// glTF out, for Blender and for tools that take a mesh.

/** Faces: the normal, then two edges whose cross product is the normal. */
const FACES = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ],
] as const;

/** A metre is 32 cubes, so the figure stands about 2 m tall in Blender. */
const METRES_PER_CUBE = 1 / 32;

const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * The figure wearing `worn`, one mesh per part, with only the faces on the outside. The
 * figure faces +z with y up, as glTF expects, and a cube is METRES_PER_CUBE across.
 */
export function writeGlb(model: Model, worn: readonly string[]): Buffer {
  const cubes = compose(model, worn);
  const chunks: Buffer[] = [];
  let length = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const add = (data: Float32Array | Uint32Array, type: string, target: number, minMax = false) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, target });
    chunks.push(bytes);
    length += bytes.length;
    const comps = type === "VEC3" ? 3 : 1;
    const accessor: Record<string, unknown> = {
      bufferView: bufferViews.length - 1,
      componentType: data instanceof Float32Array ? 5126 : 5125,
      count: data.length / comps,
      type,
    };
    if (minMax) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      data.forEach((v, n) => {
        min[n % 3] = Math.min(min[n % 3]!, v);
        max[n % 3] = Math.max(max[n % 3]!, v);
      });
      Object.assign(accessor, { min, max });
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const meshes: object[] = [];
  for (const part of model.parts.filter((p) => p.key === "body" || worn.includes(p.key))) {
    const positions: number[] = [];
    const normals: number[] = [];
    const colours: number[] = [];
    const indices: number[] = [];
    for (const [k, { slot, part: owner }] of cubes) {
      if (owner !== part.key) continue;
      const { col, row, z } = unkey(k);
      const centre = [col - (SIZE - 1) / 2, SIZE / 2 - 1 - row, z];
      const rgb = channels(model.palette[slot]?.[0] ?? "#ff00ff").map(linear);
      for (const [n, u, v] of FACES) {
        if (cubes.has(key(col + n[0], row - n[1], z + n[2]))) continue;
        const first = positions.length / 3;
        for (const [su, sv] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ] as const) {
          for (let a = 0; a < 3; a++) {
            positions.push((centre[a]! + (n[a]! + su * u[a]! + sv * v[a]!) / 2) * METRES_PER_CUBE);
          }
          normals.push(...n);
          colours.push(...rgb);
        }
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
    }
    if (indices.length === 0) continue;
    meshes.push({
      name: part.key,
      primitives: [
        {
          attributes: {
            POSITION: add(new Float32Array(positions), "VEC3", 34962, true),
            NORMAL: add(new Float32Array(normals), "VEC3", 34962),
            COLOR_0: add(new Float32Array(colours), "VEC3", 34962),
          },
          indices: add(new Uint32Array(indices), "SCALAR", 34963),
          material: 0,
        },
      ],
    });
  }
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0", generator: "GeekyKey scripts/avatar-art.ts" },
      scene: 0,
      scenes: [{ nodes: meshes.map((_, n) => n) }],
      nodes: meshes.map((mesh, n) => ({ name: (mesh as { name: string }).name, mesh: n })),
      meshes,
      materials: [
        {
          name: "cubes",
          pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 0,
            roughnessFactor: 1,
          },
        },
      ],
      buffers: [{ byteLength: length }],
      bufferViews,
      accessors,
    }),
  );
  const pad = (b: Buffer, fill: number) =>
    Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const jsonChunk = pad(json, 0x20);
  const bin = pad(Buffer.concat(chunks), 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const chunkHead = (n: number, type: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(n, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  return Buffer.concat([
    header,
    chunkHead(jsonChunk.length, 0x4e4f534a),
    jsonChunk,
    chunkHead(bin.length, 0x004e4942),
    bin,
  ]);
}

// ---------------------------------------------------------------------------------------
// A cleaned-up shape back in.

type Matrix = number[];
const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a: Matrix, b: Matrix): Matrix =>
  Array.from({ length: 16 }, (_, n) => {
    const col = Math.floor(n / 4);
    const row = n % 4;
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row]! * b[col * 4 + k]!, 0);
  });

interface GltfNode {
  matrix?: Matrix;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  mesh?: number;
  children?: number[];
}

function localMatrix(node: GltfNode): Matrix {
  if (node.matrix) return node.matrix;
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

/** Every triangle in a .glb or .obj, nine numbers each, in the file's own units. */
export function readMesh(file: string): number[] {
  const buf = readFileSync(file);
  const tris: number[] = [];
  if (file.toLowerCase().endsWith(".obj")) {
    const verts: number[][] = [];
    for (const line of buf.toString("utf8").split("\n")) {
      const [kind, ...rest] = line.trim().split(/\s+/);
      if (kind === "v") verts.push(rest.slice(0, 3).map(Number));
      if (kind !== "f") continue;
      const ids = rest.map((tok) => {
        const n = Number.parseInt(tok.split("/")[0]!, 10);
        return n < 0 ? verts.length + n : n - 1;
      });
      for (let k = 1; k + 1 < ids.length; k++) {
        for (const id of [ids[0]!, ids[k]!, ids[k + 1]!]) tris.push(...verts[id]!);
      }
    }
    return tris;
  }
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a .glb or an .obj`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLength));
  const binAt = 20 + jsonLength;
  const bin = buf.subarray(binAt + 8, binAt + 8 + buf.readUInt32LE(binAt));
  const packed = (json.extensionsUsed ?? []).filter((e: string) =>
    ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization"].includes(e),
  );
  if (packed.length > 0) {
    throw new Error(
      `${file}: it's compressed (${packed.join(", ")}). Export it again without compression.`,
    );
  }
  const accessor = (index: number) => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type as string] ?? 1;
    const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType as number];
    if (!size)
      throw new Error(`${file}: accessor ${index} has a number type this script can't read`);
    const stride = view.byteStride ?? comps * size;
    const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    return Array.from({ length: acc.count * comps }, (_, n) => {
      const o = base + Math.floor(n / comps) * stride + (n % comps) * size;
      if (acc.componentType === 5126) return bin.readFloatLE(o);
      if (acc.componentType === 5125) return bin.readUInt32LE(o);
      return acc.componentType === 5123 ? bin.readUInt16LE(o) : bin[o]!;
    });
  };
  const visit = (index: number, parent: Matrix) => {
    const node: GltfNode = json.nodes[index];
    const m = multiply(parent, localMatrix(node));
    for (const prim of node.mesh === undefined ? [] : json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const pos = accessor(prim.attributes.POSITION);
      const ids =
        prim.indices === undefined
          ? pos.map((_, n) => n).slice(0, pos.length / 3)
          : accessor(prim.indices);
      for (const id of ids) {
        const [x, y, z] = [pos[id * 3]!, pos[id * 3 + 1]!, pos[id * 3 + 2]!];
        for (let r = 0; r < 3; r++)
          tris.push(m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!);
      }
    }
    for (const child of node.children ?? []) visit(child, m);
  };
  const roots: number[] =
    json.scenes?.[json.scene ?? 0]?.nodes ??
    json.nodes
      .map((_: unknown, n: number) => n)
      .filter((n: number) => !json.nodes.some((p: GltfNode) => p.children?.includes(n)));
  for (const root of roots) visit(root, IDENTITY);
  return tris;
}

/**
 * The model with its body replaced by `tris`, a cleaned-up shape facing +z with y up, as the
 * exported .glb is. The shape is scaled to the flat art's height and centred on it, and each
 * column of cubes takes its colours from the flat art, as a fresh model would. The pieces'
 * erases are redone for the new body, and a monocle or pearls move to its new surface.
 */
export function withShape(model: Model, d: Drawing, tris: readonly number[], file: string): Model {
  if (tris.length === 0) throw new Error(`${file}: no triangles found`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  tris.forEach((v, n) => {
    min[n % 3] = Math.min(min[n % 3]!, v);
    max[n % 3] = Math.max(max[n % 3]!, v);
  });
  const pixels = d.body.flatMap((cell, i) => (cell === null ? [] : [i]));
  const cols = pixels.map((i) => i % SIZE);
  const rows = pixels.map((i) => Math.floor(i / SIZE));
  const top = Math.min(...rows);
  const scale = (Math.max(...rows) - top + 1) / (max[1]! - min[1]!);
  const middle = (Math.min(...cols) + Math.max(...cols) + 1) / 2;
  // Into the grid: x to columns, y down the rows, z to cubes from the middle.
  const grid = tris.map((v, n) => {
    const a = n % 3;
    if (a === 0) return (v - (min[0]! + max[0]!) / 2) * scale + middle;
    if (a === 1) return (max[1]! - v) * scale + top;
    return (v - (min[2]! + max[2]!) / 2) * scale;
  });

  // Each column's nearest and furthest surface, from a ray through its middle.
  const hits = new Map<number, number[]>();
  for (let t = 0; t < grid.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = grid.slice(t, t + 9) as number[];
    const area = (bx! - ax!) * (cy! - ay!) - (cx! - ax!) * (by! - ay!);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.ceil(Math.min(ax!, bx!, cx!) - 0.5));
    const x1 = Math.min(SIZE - 1, Math.floor(Math.max(ax!, bx!, cx!) - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(ay!, by!, cy!) - 0.5));
    const y1 = Math.min(SIZE - 1, Math.floor(Math.max(ay!, by!, cy!) - 0.5));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const u = ((bx! - px) * (cy! - py) - (cx! - px) * (by! - py)) / area;
        const v = ((cx! - px) * (ay! - py) - (ax! - px) * (cy! - py)) / area;
        const w = 1 - u - v;
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
        const z = u * az! + v * bz! + w * cz!;
        const column = hits.get(y * SIZE + x);
        if (column) column.push(z);
        else hits.set(y * SIZE + x, [z]);
      }
    }
  }

  const colours = surfaces(d, d.body, shapeOf(d.body, d));
  const palette = [...model.palette];
  const slotOf = d.entries.map((entry) => slotFor(palette, entry));
  const nearest = (i: number) => {
    if (d.body[i] !== null) return i;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    return pixels.reduce((best, j) =>
      ((j % SIZE) - x) ** 2 + (Math.floor(j / SIZE) - y) ** 2 <
      ((best % SIZE) - x) ** 2 + (Math.floor(best / SIZE) - y) ** 2
        ? j
        : best,
    );
  };

  const body: Part = { key: "body", cubes: new Map(), erase: new Set() };
  let overlap = 0;
  for (const [i, zs] of hits) {
    if (d.body[i] !== null) overlap++;
    const near = Math.min(...zs);
    const far = Math.max(...zs);
    const mid = (near + far) / 2;
    // The cubes whose middles are inside, or one for a sliver thinner than a cube.
    let from = Math.ceil(near);
    let to = Math.floor(far);
    if (from > to) from = to = Math.round(mid);
    const source = nearest(i);
    for (let z = Math.max(BACK, from); z <= Math.min(FRONT, to); z++) {
      const entry = z >= mid ? colours.front[source]! : colours.back[source]!;
      body.cubes.set(key(i % SIZE, Math.floor(i / SIZE), z), slotOf[entry]!);
    }
  }
  const share = overlap / Math.max(hits.size, pixels.length);
  console.log(`${file}: ${hits.size} columns, ${Math.round(share * 100)}% over the flat art`);
  if (share < 0.6) {
    console.warn(
      `${file}: it hardly overlaps the flat art. Does it face +z with y up, like the exported .glb?`,
    );
  }

  const old = model.parts[0]!;
  const extent = (part: Map<number, number> | Set<number>) => {
    const out = new Map<number, [number, number]>();
    for (const k of part.keys()) {
      const { z } = unkey(k);
      const seen = out.get(columnOf(k));
      out.set(columnOf(k), seen ? [Math.min(seen[0], z), Math.max(seen[1], z)] : [z, z]);
    }
    return out;
  };
  const oldBody = extent(old.cubes);
  const newBody = extent(body.cubes);
  const pieces = model.parts.slice(1).map((part) => {
    const source = d.pieces.find((p) => p.key === part.key);
    if (source?.front) {
      const cubes = new Map<number, number>();
      for (const [k, slot] of part.cubes) {
        const { col, row, z } = unkey(k);
        const was = oldBody.get(columnOf(k))?.[1];
        const now = newBody.get(columnOf(k))?.[1];
        cubes.set(was === undefined || now === undefined ? k : key(col, row, z + now - was), slot);
      }
      return { ...part, cubes };
    }
    const own = extent(part.cubes);
    const cleared = new Set([...part.erase].map(columnOf).filter((c) => !own.has(c)));
    const erase = new Set<number>();
    for (const k of body.cubes.keys()) {
      const range = own.get(columnOf(k));
      const { z } = unkey(k);
      if (cleared.has(columnOf(k)) || (range && (z < range[0] || z > range[1]))) erase.add(k);
    }
    return { ...part, erase };
  });
  return { palette, parts: [body, ...pieces] };
}

// ---------------------------------------------------------------------------------------
// The app's copy.

/**
 * voxel-data.ts: one palette for both characters, and each part as runs of cubes along z,
 * five numbers a run (row, column, first z, how many, palette entry), and its erases as four.
 */
export function voxelDataFile(figures: readonly { key: string; model: Model }[]): string {
  const entries: string[] = [];
  const entryOf = (entry: Entry) => {
    const s = JSON.stringify(entry);
    const k = entries.indexOf(s);
    return k === -1 ? entries.push(s) - 1 : k;
  };
  const runs = (
    cubes: Map<number, number> | Set<number>,
    colourOf: (slot: number) => number | null,
  ) => {
    const sorted = [...cubes.keys()].sort((a, b) => a - b);
    const lines: string[] = [];
    let line: number[] = [];
    let lastRow = -1;
    for (let n = 0; n < sorted.length;) {
      const k = sorted[n]!;
      const { col, row, z } = unkey(k);
      const value = cubes instanceof Map ? cubes.get(k)! : 0;
      let length = 1;
      while (
        sorted[n + length] === k + length &&
        (cubes instanceof Map ? cubes.get(k + length) === value : true)
      ) {
        length++;
      }
      if (row !== lastRow && line.length > 0) {
        lines.push(line.join(","));
        line = [];
      }
      lastRow = row;
      const colour = colourOf(value);
      line.push(row, col, z, length, ...(colour === null ? [] : [colour]));
      n += length;
    }
    if (line.length > 0) lines.push(line.join(","));
    return lines.map((l) => `          ${l},`);
  };
  const body = figures.flatMap(({ key: who, model }) => [
    "  {",
    `    key: "${who}",`,
    "    parts: [",
    ...model.parts.flatMap((part) => [
      "      {",
      `        key: "${part.key}",`,
      "        cubes: [",
      ...runs(part.cubes, (slot) => entryOf(model.palette[slot] ?? ["#ff00ff", null])),
      "        ],",
      "        erase: [",
      ...runs(part.erase, () => null),
      "        ],",
      "      },",
    ]),
    "    ],",
    "  },",
  ]);
  return [
    "// Generated by scripts/avatar-art.ts from art/avatar/*/model.vox. Don't edit it by hand:",
    "// edit the model in MagicaVoxel, then run `pnpm avatar-art` in apps/event-web.",
    "",
    "/** [colour, what the guest's choice changes]. */",
    'export const VOXEL_PALETTE: readonly (readonly [string, "skin" | "hair" | "suit" | "item" | null])[] = [',
    ...entries.map((e) => `  ${e.replace(",", ", ")},`),
    "];",
    "",
    "export interface VoxelPart {",
    '  /** "body", or a piece\'s key. */',
    "  key: string;",
    "  /** Runs of cubes along z, five numbers each: row, column, first z, length, palette entry. */",
    "  cubes: readonly number[];",
    "  /** Runs of the body's cubes this piece takes away, four numbers each. */",
    "  erase: readonly number[];",
    "}",
    "",
    "export const VOXEL_FIGURES: readonly { key: string; parts: readonly VoxelPart[] }[] = [",
    ...body,
    "];",
    "",
  ].join("\n");
}
