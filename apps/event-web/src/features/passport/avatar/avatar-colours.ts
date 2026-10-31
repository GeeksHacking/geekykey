import { BASE, type Art, type Cell, type Pixels } from "@/features/passport/avatar/art";

/*
  The guest's skin tone, hair colour and suit colour (FRO-105). The choice only changes the
  colours of the pixels the art tags skin, hair or suit, so it needs no extra art, and it
  stays in this browser, so it needs no backend. A piece keeps its own colours: a black hat
  stays black on a navy suit.
*/

interface Swatch<Key extends string> {
  key: Key;
  label: string;
  /** What the art's own colour for this part becomes. */
  main: string;
}

export const SKIN_TONES = [
  { key: "light", label: "Light", main: "#f6d5b8" },
  { key: "warm", label: "Warm", main: BASE.skin },
  { key: "medium", label: "Medium", main: "#c98e5c" },
  { key: "brown", label: "Brown", main: "#8d5a36" },
  { key: "deep", label: "Deep", main: "#5c3a24" },
] as const satisfies readonly Swatch<string>[];

export const HAIR_COLOURS = [
  { key: "black", label: "Black", main: BASE.hair },
  { key: "brown", label: "Brown", main: "#3b2a1e" },
  { key: "auburn", label: "Auburn", main: "#7a3a1c" },
  { key: "blonde", label: "Blonde", main: "#d9b45a" },
  { key: "grey", label: "Grey", main: "#9a9690" },
] as const satisfies readonly Swatch<string>[];

export const SUIT_COLOURS = [
  { key: "black", label: "Black", main: BASE.suit },
  { key: "navy", label: "Navy", main: "#1b2a4a" },
  { key: "burgundy", label: "Burgundy", main: "#5a1a26" },
  { key: "emerald", label: "Emerald", main: "#14463a" },
  { key: "ivory", label: "Ivory", main: "#e3d7bb" },
] as const satisfies readonly Swatch<string>[];

export interface AvatarColours {
  skin: (typeof SKIN_TONES)[number]["key"];
  hair: (typeof HAIR_COLOURS)[number]["key"];
  suit: (typeof SUIT_COLOURS)[number]["key"];
}

/** The art as drawn. */
export const DEFAULT_COLOURS: AvatarColours = { skin: "warm", hair: "black", suit: "black" };

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hex = (c: Rgb) =>
  `#${c
    .map((v) =>
      Math.round(Math.min(Math.max(v, 0), 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((k) => a[k]! + (b[k]! - a[k]!) * t) as Rgb;

/** Skin is shaded in tones of one colour, so each pixel keeps its ratio to the art's main skin. */
function skinTone(pixel: Rgb, main: Rgb): Rgb {
  const base = rgb(BASE.skin);
  return [0, 1, 2].map((k) => (main[k]! * pixel[k]!) / Math.max(base[k]!, 1)) as Rgb;
}

/**
 * Hair and suit are drawn near black, with lighter greys for the lapels and creases. A pixel
 * keeps how much lighter than the art's main colour it is: towards white on a dark choice,
 * towards black on a light one, so a lapel still shows on an ivory suit.
 */
function darkTone(pixel: Rgb, base: Rgb, main: Rgb): Rgb {
  const lift = (Math.max(...pixel) - Math.max(...base)) / 255;
  if (lift <= 0) return main;
  const light = 0.299 * main[0] + 0.587 * main[1] + 0.114 * main[2] > 128;
  return mix(main, light ? [0, 0, 0] : [255, 255, 255], lift);
}

/** The art in the guest's colours, ready to paint. */
export function recolour(art: Art, colours: AvatarColours): Pixels {
  const skin = rgb((SKIN_TONES.find((tone) => tone.key === colours.skin) ?? SKIN_TONES[1]).main);
  const hair = rgb(
    (HAIR_COLOURS.find((tone) => tone.key === colours.hair) ?? HAIR_COLOURS[0]).main,
  );
  const suit = rgb(
    (SUIT_COLOURS.find((tone) => tone.key === colours.suit) ?? SUIT_COLOURS[0]).main,
  );
  const memo = new Map<Cell, string>();
  return art.map((cell) => {
    if (!cell) return null;
    const known = memo.get(cell);
    if (known) return known;
    let out = cell.colour;
    if (cell.tag === "skin" && colours.skin !== DEFAULT_COLOURS.skin) {
      out = hex(skinTone(rgb(cell.colour), skin));
    } else if (cell.tag === "hair" && colours.hair !== DEFAULT_COLOURS.hair) {
      out = hex(darkTone(rgb(cell.colour), rgb(BASE.hair), hair));
    } else if (cell.tag === "suit" && colours.suit !== DEFAULT_COLOURS.suit) {
      out = hex(darkTone(rgb(cell.colour), rgb(BASE.suit), suit));
    }
    memo.set(cell, out);
    return out;
  });
}

function pick<Key extends string>(
  swatches: readonly Swatch<Key>[],
  value: unknown,
  fallback: Key,
): Key {
  return swatches.find((swatch) => swatch.key === value)?.key ?? fallback;
}

/** A saved choice, read back. Anything it doesn't recognise falls back to the base art's colour. */
export function parseColours(raw: string | null): AvatarColours {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
  } catch {
    // A broken value reads as nothing saved.
  }
  return {
    skin: pick(SKIN_TONES, saved.skin, DEFAULT_COLOURS.skin),
    hair: pick(HAIR_COLOURS, saved.hair, DEFAULT_COLOURS.hair),
    suit: pick(SUIT_COLOURS, saved.suit, DEFAULT_COLOURS.suit),
  };
}
