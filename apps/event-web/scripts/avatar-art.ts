/**
 * Turns Joshua's avatar PNGs (FRO-105) into src/features/passport/avatar/art-data.ts.
 * Run from apps/event-web after changing a file in art/avatar/<character>/:
 *
 *   pnpm avatar-art
 *   pnpm avatar-art --preview /tmp/avatar   # also draws every piece worn, 8x, to look at
 *
 * Each character (one in a suit, one in a dress) is a 64x64 base and one Sprite Fusion edit
 * of that same base per piece. An edit comes cropped to the character and with a few colours off by one or two, so
 * the script:
 *
 * 1. lines each edit up with the base, at the offset where most of their pixels agree;
 * 2. keeps only the pixels the edit changed by more than export noise, and only inside the
 *    piece's area, so noise elsewhere never reaches the avatar. A pixel the edit removed (the
 *    arm that lifts the glass) is kept as an erase;
 * 3. puts every file on one palette of a few dozen colours;
 * 4. tags each pixel skin, hair or suit, so the guest's colour choice reaches it, or item, the
 *    piece itself, or leaves it untagged. Item and untagged pixels keep their colour (the hat,
 *    the shirt, the outline).
 *
 * The PNGs must be 8-bit RGBA, which is what Sprite Fusion exports.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { deflateSync, inflateSync } from "node:zlib";

const ART_DIR = "art/avatar";
const OUT_FILE = "src/features/passport/avatar/art-data.ts";
const SIZE = 64;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PieceSource {
  key: string;
  /**
   * In the 64x64 grid, where the piece may change the base. A change anywhere else is export
   * noise and is dropped.
   */
  area: Box[];
  /**
   * The piece itself, inside `area`, which keeps its own colours. The rest of `area` is the
   * body moving to hold it, like the arm that lifts the glass, and takes the guest's colours.
   */
  item: Box[];
  /**
   * Where the piece hides the body entirely, so every pixel of the edit there is the piece,
   * changed or not. A black hat over black hair looks unchanged, but blonde hair mustn't show
   * through it.
   */
  covers?: Box[];
}

interface CharacterSource {
  key: string;
  /** Where the parts are, in rows of the 64x64 grid. */
  rows: {
    /** Dark pixels above this row are hair, eyebrows included. */
    hairBelow: number;
    /** The back of the head ends here, for the 3D figure. */
    chin: number;
    /** The shoes start here, and look the same from behind. */
    shoes: number;
  };
  /** The eyes, which are dark but aren't hair. */
  eyes: Box;
  /** Which pixels the suit (or dress) colour reaches. */
  isSuit: (c: Rgb, y: number) => boolean;
  /** In slot order: the first stamp slot gives the first piece. Each is <key>.png. */
  pieces: PieceSource[];
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
const neutral = (c: Rgb) => Math.max(...c) - Math.min(...c) <= 10;

const CHARACTERS: CharacterSource[] = [
  {
    key: "suit",
    rows: { hairBelow: 15, chin: 20, shoes: 56 },
    eyes: box(27, 13, 36, 14),
    // Black and the greys of the lapels, below the head and above the shoes. The outline is a
    // very dark red, so it isn't a neutral dark and keeps its colour.
    isSuit: (c, y) => neutral(c) && hsl(c).l < 0.35 && y >= 15 && y < 56,
    pieces: [
      {
        key: "hat",
        area: [box(19, 0, 44, 13)],
        item: [box(19, 0, 44, 13)],
        // The crown and the brim, down to the brim's lowest row across the forehead.
        covers: [box(19, 0, 44, 10)],
      },
      { key: "monocle", area: [box(31, 10, 37, 18)], item: [box(31, 10, 37, 18)] },
      {
        key: "cane",
        // The hand moves out to hold the cane. The stick shows above and below the hand.
        area: [box(14, 30, 24, 58)],
        item: [box(17, 31, 21, 35), box(19, 40, 21, 58)],
      },
      {
        key: "glass",
        // The arm lifts from the side (where the edit erases it) to hold the glass out.
        area: [box(44, 14, 57, 35), box(39, 33, 45, 44)],
        item: [box(45, 14, 56, 24)],
      },
    ],
  },
  {
    key: "dress",
    rows: { hairBelow: 16, chin: 16, shoes: 63 },
    eyes: box(28, 10, 36, 12),
    // The dress's greens, and the shoes, which match it. Its dark edges are the outline, and
    // the export tints a few near-black hair pixels green, so those stay hair.
    isSuit: (c, y) => {
      const { h, s, l } = hsl(c);
      return y >= 16 && h >= 70 && h <= 180 && s >= 0.2 && l >= 0.1;
    },
    pieces: [
      {
        key: "feather",
        area: [box(24, 0, 46, 9)],
        item: [box(24, 0, 46, 9)],
        // The headband is dark over dark hair, so it covers the hair whatever its colour.
        covers: [box(25, 7, 40, 8)],
      },
      { key: "pearls", area: [box(26, 16, 38, 24)], item: [box(26, 16, 38, 24)] },
      {
        key: "cane",
        // The arm swings out to hold the cane, which shows below the hand.
        area: [box(16, 30, 25, 62)],
        item: [box(18, 38, 20, 62)],
      },
      {
        key: "glass",
        // The forearm lifts from the side (where the edit erases it) to hold the glass up.
        area: [box(38, 19, 48, 42)],
        item: [box(41, 19, 47, 23)],
      },
    ],
  },
];

/** Two colours closer than this (RGB distance) are the same colour with export noise. */
const NOISE = 48;
/** Colours closer than this share one palette entry. */
const SAME_COLOUR = 18;

type Rgb = [number, number, number];
type Role = "skin" | "hair" | "suit" | "item" | null;
type Grid = (Rgb | null)[];

// ---------------------------------------------------------------------------------------
// PNG in and out, for 8-bit RGBA only, so the script needs no dependency.

function decodePng(path: string): { width: number; height: number; grid: Grid } {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colourType, , , interlace] = body.subarray(8);
      if (depth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(`${path}: export it as an 8-bit RGBA PNG without interlacing`);
      }
    }
    if (type === "IDAT") data.push(body);
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= 4 ? out[y * stride + i - 4]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4]! : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter];
      if (predictor === undefined) throw new Error(`${path}: unknown PNG filter ${filter}`);
      out[y * stride + i] = (x + predictor) & 0xff;
    }
  }
  const grid: Grid = [];
  for (let i = 0; i < width * height; i++) {
    const alpha = out[i * 4 + 3]!;
    if (alpha !== 0 && alpha !== 255) {
      throw new Error(`${path}: pixel ${i % width},${Math.floor(i / width)} is half see-through`);
    }
    grid.push(alpha ? [out[i * 4]!, out[i * 4 + 1]!, out[i * 4 + 2]!] : null);
  }
  return { width, height, grid };
}

function crc32(bytes: Buffer) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function encodePng(width: number, height: number, rgba: Buffer) {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------
// Colour.

const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function hsl([r, g, b]: Rgb) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn
      ? 60 * (((gn - bn) / d + 6) % 6)
      : max === gn
        ? 60 * ((bn - rn) / d + 2)
        : 60 * ((rn - gn) / d + 4);
  return { h, s, l };
}

const inBox = (b: Box, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
const inAny = (boxes: Box[], x: number, y: number) => boxes.some((b) => inBox(b, x, y));

function roleOf(c: Rgb, x: number, y: number, inItem: boolean, who: CharacterSource): Role {
  if (inItem) return "item";
  const { h, s, l } = hsl(c);
  if (h >= 5 && h <= 42 && s >= 0.25 && l >= 0.3 && l <= 0.92) return "skin";
  if (who.isSuit(c, y)) return "suit";
  if (neutral(c) && l < 0.35 && y < who.rows.hairBelow && !inBox(who.eyes, x, y)) return "hair";
  return null;
}

// ---------------------------------------------------------------------------------------
// Lining up and differences.

/** Puts a cropped edit into the 64x64 grid where most of its pixels agree with the base. */
function lineUp(base: Grid, edit: { width: number; height: number; grid: Grid }, file: string) {
  const solid = base.flatMap((c, i) => (c ? [i] : []));
  let best = { agree: -1, ox: 0, oy: 0 };
  for (let oy = -edit.height; oy <= SIZE; oy++) {
    for (let ox = -edit.width; ox <= SIZE; ox++) {
      let agree = 0;
      for (const i of solid) {
        const ex = (i % SIZE) - ox;
        const ey = Math.floor(i / SIZE) - oy;
        if (ex < 0 || ey < 0 || ex >= edit.width || ey >= edit.height) continue;
        const c = edit.grid[ey * edit.width + ex];
        if (c && distance(c, base[i]!) < NOISE) agree++;
      }
      if (agree > best.agree) best = { agree, ox, oy };
    }
  }
  const share = best.agree / solid.length;
  if (share < 0.8) {
    throw new Error(
      `${file}: only ${Math.round(share * 100)}% of it matches the base. Is it an edit of the same character?`,
    );
  }
  const placed: Grid = Array.from({ length: SIZE * SIZE }, () => null);
  edit.grid.forEach((c, j) => {
    const x = (j % edit.width) + best.ox;
    const y = Math.floor(j / edit.width) + best.oy;
    if (!c) return;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
      throw new Error(`${file}: it reaches past the 64x64 grid at ${x},${y}`);
    }
    placed[y * SIZE + x] = c;
  });
  return { placed, ...best, share };
}

type Change = { kind: "paint"; colour: Rgb } | { kind: "erase" };

function changes(base: Grid, placed: Grid, piece: PieceSource) {
  const out = new Map<number, Change>();
  let dropped = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const b = base[i] ?? null;
    const e = placed[i] ?? null;
    const covered = e !== null && inAny(piece.covers ?? [], i % SIZE, Math.floor(i / SIZE));
    const changed = covered || (b && e ? distance(b, e) >= NOISE : b !== e);
    if (!changed) continue;
    if (!inAny(piece.area, i % SIZE, Math.floor(i / SIZE))) {
      dropped++;
      continue;
    }
    out.set(i, e ? { kind: "paint", colour: e } : { kind: "erase" });
  }
  return { changes: out, dropped };
}

// ---------------------------------------------------------------------------------------
// One palette.

function buildPalette(colours: Rgb[]) {
  const counts = new Map<string, { c: Rgb; n: number }>();
  for (const c of colours) {
    const k = hex(c);
    const seen = counts.get(k);
    if (seen) seen.n++;
    else counts.set(k, { c, n: 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n || hex(a.c).localeCompare(hex(b.c)));
  const clusters: { members: Rgb[]; seed: Rgb }[] = [];
  for (const { c, n } of sorted) {
    const near = clusters.find((cl) => distance(cl.seed, c) < SAME_COLOUR);
    const members = Array.from({ length: n }, () => c);
    if (near) near.members.push(...members);
    else clusters.push({ seed: c, members });
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const reps = clusters.map(
    (cl) => [0, 1, 2].map((k) => median(cl.members.map((m) => m[k]!))) as Rgb,
  );
  return (c: Rgb) =>
    reps[clusters.findIndex((cl) => cl.members.includes(c) || distance(cl.seed, c) < SAME_COLOUR)]!;
}

// ---------------------------------------------------------------------------------------

/** One character per palette entry, never "." or "_", which a row uses for nothing and erase. */
const CHARS =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#%&*+-/:;<=>?@^|~" +
  String.fromCharCode(...Array.from({ length: 64 }, (_, k) => 0xc0 + k));

function main() {
  const { values } = parseArgs({ options: { preview: { type: "string" } } });

  const characters = CHARACTERS.map((who) => {
    const dir = join(ART_DIR, who.key);
    const baseFile = decodePng(join(dir, "base.png"));
    if (baseFile.width !== SIZE || baseFile.height !== SIZE) {
      throw new Error(
        `${who.key}/base.png: it should be ${SIZE}x${SIZE}, not ${baseFile.width}x${baseFile.height}`,
      );
    }
    const base = baseFile.grid;
    const pieces = who.pieces.map((piece) => {
      const file = `${who.key}/${piece.key}.png`;
      const lined = lineUp(base, decodePng(join(ART_DIR, file)), file);
      const { changes: diff, dropped } = changes(base, lined.placed, piece);
      console.log(
        `${file}: at ${lined.ox},${lined.oy}, ${Math.round(lined.share * 100)}% matches the base, ` +
          `${diff.size} pixels changed, ${dropped} dropped as outside its area`,
      );
      return { piece, diff };
    });
    return { who, base, pieces };
  });

  const snap = buildPalette(
    characters.flatMap(({ base, pieces }) => [
      ...base.filter((c): c is Rgb => c !== null),
      ...pieces.flatMap(({ diff }) =>
        [...diff.values()].flatMap((ch) => (ch.kind === "paint" ? [ch.colour] : [])),
      ),
    ]),
  );

  const entries: string[] = [];
  const charFor = (c: Rgb, role: Role) => {
    const entry = JSON.stringify([hex(snap(c)), role]);
    let k = entries.indexOf(entry);
    if (k === -1) k = entries.push(entry) - 1;
    if (k >= CHARS.length) throw new Error(`More than ${CHARS.length} colours. Raise SAME_COLOUR?`);
    return CHARS[k]!;
  };
  const rows = (cell: (i: number) => string) =>
    Array.from({ length: SIZE }, (_, y) =>
      Array.from({ length: SIZE }, (_, x) => cell(y * SIZE + x)).join(""),
    );

  const out = characters.map(({ who, base, pieces }) => ({
    who,
    body: rows((i) => {
      const c = base[i];
      return c ? charFor(c, roleOf(c, i % SIZE, Math.floor(i / SIZE), false, who)) : ".";
    }),
    pieces: pieces.map(({ piece, diff }) => ({
      key: piece.key,
      rows: rows((i) => {
        const ch = diff.get(i);
        if (!ch) return ".";
        if (ch.kind === "erase") return "_";
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        return charFor(ch.colour, roleOf(ch.colour, x, y, inAny(piece.item, x, y), who));
      }),
    })),
  }));

  const quote = (indent: string) => (s: string) => `${indent}"${s}",`;
  const file = [
    "// Generated by scripts/avatar-art.ts from art/avatar/*/*.png. Don't edit it by hand: change",
    "// the art or the script, then run `pnpm avatar-art` in apps/event-web.",
    "",
    `export const ART_SIZE = ${SIZE};`,
    "",
    "/** [colour, what the guest's choice changes]. A row's character is its index in CHARS. */",
    "export const ART_PALETTE = [",
    ...entries.map((e) => `  ${e.replace(",", ", ")},`),
    "] as const;",
    "",
    `export const ART_CHARS = ${JSON.stringify(CHARS)};`,
    "",
    "/**",
    ' * Each character\'s body, one string per row with "." transparent, and its pieces in slot',
    ' * order, where "." leaves the body as it is and "_" erases it.',
    " */",
    "export const ART_CHARACTERS = [",
    ...out.flatMap(({ who, body, pieces }) => [
      "  {",
      `    key: "${who.key}",`,
      `    rows: { chin: ${who.rows.chin}, shoes: ${who.rows.shoes} },`,
      "    body: [",
      ...body.map(quote("      ")),
      "    ],",
      "    pieces: [",
      ...pieces.flatMap((p) => [
        "      {",
        `        key: "${p.key}",`,
        "        rows: [",
        ...p.rows.map(quote("          ")),
        "        ],",
        "      },",
      ]),
      "    ],",
      "  },",
    ]),
    "] as const;",
    "",
  ].join("\n");
  writeFileSync(OUT_FILE, file);
  console.log(`${OUT_FILE}: ${entries.length} colours`);

  if (values.preview) {
    mkdirSync(values.preview, { recursive: true });
    const palette = entries.map((e) => JSON.parse(e) as [string, Role]);
    const toRgb = (h: string): Rgb => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)) as Rgb;
    const layer = (stack: string[][]) => {
      const grid: (Rgb | null)[] = Array.from({ length: SIZE * SIZE }, () => null);
      for (const r of stack) {
        [...r.join("")].forEach((ch, i) => {
          if (ch === ".") return;
          grid[i] = ch === "_" ? null : toRgb(palette[CHARS.indexOf(ch)]![0]);
        });
      }
      return grid;
    };
    // Tags: skin orange, hair blue, suit green, the rest grey. Pieces aren't shown here.
    const TAG: Record<string, Rgb> = {
      skin: [240, 140, 40],
      hair: [60, 110, 240],
      suit: [40, 170, 90],
    };
    const strips = out.map(({ body, pieces }) => [
      layer([body]),
      ...pieces.map((p) => layer([body, p.rows])),
      layer([body, ...pieces.map((p) => p.rows)]),
      [...body.join("")].map((ch): Rgb | null =>
        ch === "." ? null : (TAG[palette[CHARS.indexOf(ch)]![1] ?? ""] ?? [150, 150, 150]),
      ),
    ]);
    const scale = 8;
    const across = Math.max(...strips.map((views) => views.length));
    const w = across * SIZE * scale;
    const h = strips.length * SIZE * scale;
    const rgba = Buffer.alloc(w * h * 4);
    strips.forEach((views, row) => {
      views.forEach((view, v) => {
        for (let y = 0; y < SIZE * scale; y++) {
          for (let x = 0; x < SIZE * scale; x++) {
            const c = view[Math.floor(y / scale) * SIZE + Math.floor(x / scale)] ?? [120, 140, 160];
            rgba.set([...c, 255], ((row * SIZE * scale + y) * w + v * SIZE * scale + x) * 4);
          }
        }
      });
    });
    const path = join(values.preview, "avatar-art.png");
    writeFileSync(path, encodePng(w, h, rgba));
    console.log(
      `${path}: per character, the base, each piece on it, every piece at once, and the colour tags`,
    );
  }
}

main();
