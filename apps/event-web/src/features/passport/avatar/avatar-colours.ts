import {
  CHARACTERS,
  type Art,
  type Cell,
  type CharacterKey,
  type Pixels,
} from "@/features/passport/avatar/art";

/*
  The guest's character, skin tone, hair colour and suit colour (FRO-105). The colours only
  change the pixels the art tags skin, hair or suit, so they need no extra art, and the choice
  stays in this browser, so it needs no backend. A piece keeps its own colours: a black hat
  stays black on a navy suit.
*/

const { suit: man, dress: woman } = CHARACTERS;

interface Swatch<Key extends string> {
  key: Key;
  label: string;
  /** What the art's own colour for this part becomes. */
  main: string;
}

export const CHARACTER_CHOICES = [
  { key: "suit", label: "In a suit" },
  { key: "dress", label: "In a dress" },
] as const satisfies readonly { key: CharacterKey; label: string }[];

export const SKIN_TONES = [
  { key: "light", label: "Light", main: woman.base.skin },
  { key: "warm", label: "Warm", main: man.base.skin },
  { key: "medium", label: "Medium", main: "#c98e5c" },
  { key: "brown", label: "Brown", main: "#8d5a36" },
  { key: "deep", label: "Deep", main: "#5c3a24" },
] as const satisfies readonly Swatch<string>[];

export const HAIR_COLOURS = [
  { key: "black", label: "Black", main: man.base.hair },
  { key: "brown", label: "Brown", main: "#3b2a1e" },
  { key: "auburn", label: "Auburn", main: "#7a3a1c" },
  { key: "blonde", label: "Blonde", main: "#d9b45a" },
  { key: "grey", label: "Grey", main: "#9a9690" },
] as const satisfies readonly Swatch<string>[];

export const SUIT_COLOURS = [
  { key: "black", label: "Black", main: man.base.suit },
  { key: "navy", label: "Navy", main: "#1b2a4a" },
  { key: "burgundy", label: "Burgundy", main: "#5a1a26" },
  { key: "emerald", label: "Emerald", main: woman.base.suit },
  { key: "ivory", label: "Ivory", main: "#e3d7bb" },
] as const satisfies readonly Swatch<string>[];

export interface AvatarColours {
  character: CharacterKey;
  skin: (typeof SKIN_TONES)[number]["key"];
  hair: (typeof HAIR_COLOURS)[number]["key"];
  suit: (typeof SUIT_COLOURS)[number]["key"];
}

/** Each character as drawn. Choosing a character starts from these. */
const DRAWN: Record<CharacterKey, Omit<AvatarColours, "character">> = {
  suit: { skin: "warm", hair: "black", suit: "black" },
  dress: { skin: "light", hair: "black", suit: "emerald" },
};

export function coloursFor(character: CharacterKey): AvatarColours {
  return { character, ...DRAWN[character] };
}

/** Nothing chosen yet: the character in a suit, as drawn. */
export const DEFAULT_COLOURS: AvatarColours = coloursFor("suit");

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

function toHsl([r, g, b]: Rgb): Rgb {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn ? ((gn - bn) / d + 6) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: Rgb): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Skin is shaded in tones of one colour, so each pixel keeps its ratio to the art's main skin. */
function ratioTone(pixel: Rgb, base: Rgb, main: Rgb): Rgb {
  return [0, 1, 2].map((k) => (main[k]! * pixel[k]!) / Math.max(base[k]!, 1)) as Rgb;
}

/**
 * A suit and hair drawn near black, with lighter greys for the lapels and creases. A pixel
 * keeps how much lighter than the art's main colour it is: towards white on a dark choice,
 * towards black on a light one, so a lapel still shows on an ivory suit.
 */
function darkTone(pixel: Rgb, base: Rgb, main: Rgb): Rgb {
  const lift = (Math.max(...pixel) - Math.max(...base)) / 255;
  if (lift <= 0) return main;
  const light = 0.299 * main[0] + 0.587 * main[1] + 0.114 * main[2] > 128;
  return mix(main, light ? [0, 0, 0] : [255, 255, 255], lift);
}

/** A dress drawn in a colour, with lighter and darker folds: each keeps its step in lightness. */
function shadeTone(pixel: Rgb, base: Rgb, main: Rgb): Rgb {
  if (pixel.every((v, k) => v === base[k])) return main;
  const [h, s, l] = toHsl(main);
  const step = toHsl(pixel)[2] - toHsl(base)[2];
  return fromHsl([h, s, Math.min(Math.max(l + step, 0), 1)]);
}

const isDark = (c: Rgb) => Math.max(...c) < 48;

/** The art in the guest's colours, ready to paint. */
export function recolour(art: Art, colours: AvatarColours): Pixels {
  const who = CHARACTERS[colours.character];
  const drawn = DRAWN[colours.character];
  const main = {
    skin: rgb((SKIN_TONES.find((tone) => tone.key === colours.skin) ?? SKIN_TONES[1]).main),
    hair: rgb((HAIR_COLOURS.find((tone) => tone.key === colours.hair) ?? HAIR_COLOURS[0]).main),
    suit: rgb((SUIT_COLOURS.find((tone) => tone.key === colours.suit) ?? SUIT_COLOURS[0]).main),
  };
  const tone = (part: "skin" | "hair" | "suit", pixel: Rgb) => {
    const base = rgb(who.base[part]);
    if (part === "skin") return ratioTone(pixel, base, main.skin);
    return isDark(base) ? darkTone(pixel, base, main[part]) : shadeTone(pixel, base, main[part]);
  };
  const memo = new Map<Cell, string>();
  return art.map((cell) => {
    if (!cell) return null;
    const known = memo.get(cell);
    if (known) return known;
    const part = cell.tag;
    const out =
      (part === "skin" || part === "hair" || part === "suit") && colours[part] !== drawn[part]
        ? hex(tone(part, rgb(cell.colour)))
        : cell.colour;
    memo.set(cell, out);
    return out;
  });
}

function pick<Key extends string>(
  swatches: readonly { key: Key }[],
  value: unknown,
  fallback: Key,
): Key {
  return swatches.find((swatch) => swatch.key === value)?.key ?? fallback;
}

/**
 * A saved choice, read back. Anything it doesn't recognise falls back to the character in a
 * suit, or to the chosen character's own colour.
 */
export function parseColours(raw: string | null): AvatarColours {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
  } catch {
    // A broken value reads as nothing saved.
  }
  const character = pick(CHARACTER_CHOICES, saved.character, DEFAULT_COLOURS.character);
  const drawn = DRAWN[character];
  return {
    character,
    skin: pick(SKIN_TONES, saved.skin, drawn.skin),
    hair: pick(HAIR_COLOURS, saved.hair, drawn.hair),
    suit: pick(SUIT_COLOURS, saved.suit, drawn.suit),
  };
}
