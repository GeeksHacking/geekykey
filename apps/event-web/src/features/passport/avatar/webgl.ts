let known: boolean | null = null;

/**
 * Whether this browser can draw the avatar's cubes. The answer is cached, so the sticker's
 * repeated draws do not take a context each time. A phone without WebGL keeps the flat
 * avatar and never downloads three.js.
 */
export function hasWebGL(): boolean {
  if (known !== null) return known;
  try {
    const canvas = document.createElement("canvas");
    known = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    known = false;
  }
  return known;
}
