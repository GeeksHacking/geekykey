import { BASE, type Pixels } from "@/features/passport/avatar/art";

/*
  The guest's skin tone, hair colour and suit colour (FRO-105). The choice only swaps the base
  body's colours, so it needs no extra art, and it stays in this browser, so it needs no
  backend. Pieces keep their own colours: a black hat stays black on a navy suit.
*/

interface Swatch<Key extends string> {
  key: Key;
  label: string;
  main: string;
  /** The darker colour the art uses beside the main one. Hair has none. */
  shade?: string;
}

export const SKIN_TONES = [
  { key: "light", label: "Light", main: "#f6d5b8", shade: "#dcb08c" },
  { key: "warm", label: "Warm", main: BASE.skin, shade: BASE.skinShade },
  { key: "medium", label: "Medium", main: "#c98e5c", shade: "#a8713f" },
  { key: "brown", label: "Brown", main: "#8d5a36", shade: "#6e4224" },
  { key: "deep", label: "Deep", main: "#5c3a24", shade: "#432918" },
] as const satisfies readonly Swatch<string>[];

export const HAIR_COLOURS = [
  { key: "black", label: "Black", main: "#16130f" },
  { key: "brown", label: "Brown", main: BASE.hair },
  { key: "auburn", label: "Auburn", main: "#7a3a1c" },
  { key: "blonde", label: "Blonde", main: "#d9b45a" },
  { key: "grey", label: "Grey", main: "#9a9690" },
] as const satisfies readonly Swatch<string>[];

export const SUIT_COLOURS = [
  { key: "black", label: "Black", main: BASE.suit, shade: BASE.suitShade },
  { key: "navy", label: "Navy", main: "#1b2a4a", shade: "#2d4170" },
  { key: "burgundy", label: "Burgundy", main: "#5a1a26", shade: "#7c2d3b" },
  { key: "emerald", label: "Emerald", main: "#14463a", shade: "#1f6452" },
  { key: "ivory", label: "Ivory", main: "#e3d7bb", shade: "#c4b694" },
] as const satisfies readonly Swatch<string>[];

export interface AvatarColours {
  skin: (typeof SKIN_TONES)[number]["key"];
  hair: (typeof HAIR_COLOURS)[number]["key"];
  suit: (typeof SUIT_COLOURS)[number]["key"];
}

/** The base art as drawn. */
export const DEFAULT_COLOURS: AvatarColours = { skin: "warm", hair: "brown", suit: "black" };

function swapsFor(colours: AvatarColours): Map<string, string> {
  const skin = SKIN_TONES.find((tone) => tone.key === colours.skin) ?? SKIN_TONES[1];
  const hair = HAIR_COLOURS.find((tone) => tone.key === colours.hair) ?? HAIR_COLOURS[1];
  const suit = SUIT_COLOURS.find((tone) => tone.key === colours.suit) ?? SUIT_COLOURS[0];
  return new Map([
    [BASE.skin, skin.main],
    [BASE.skinShade, skin.shade],
    [BASE.hair, hair.main],
    [BASE.suit, suit.main],
    [BASE.suitShade, suit.shade],
  ]);
}

/** The base body's pixels in the guest's colours. Apply it to the body only, never a piece. */
export function recolour(pixels: Pixels, colours: AvatarColours): Pixels {
  const swaps = swapsFor(colours);
  return pixels.map((pixel) => (pixel ? (swaps.get(pixel) ?? pixel) : null));
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
