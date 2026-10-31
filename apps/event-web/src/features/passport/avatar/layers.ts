import { useMemo } from "react";

import { BODY, composite, SIZE, type Pixels } from "@/features/passport/avatar/art";
import { recolour, type AvatarColours } from "@/features/passport/avatar/avatar-colours";
import type { Slot } from "@/features/passport/avatar/outfit";

/** The body in the guest's colours, with every worn piece on top in slot order. */
export function dressedPixels(slots: readonly Slot[], colours: AvatarColours): Pixels {
  return composite([
    recolour(BODY, colours),
    ...slots.filter((slot) => slot.worn).map((slot) => slot.piece.pixels),
  ]);
}

/** Paints pixels one cell per pixel. CSS scales the image up with `image-rendering: pixelated`. */
export function paintPixels(
  ctx: CanvasRenderingContext2D,
  pixels: Pixels,
  x0 = 0,
  y0 = 0,
  cell = 1,
) {
  pixels.forEach((pixel, i) => {
    if (!pixel) return;
    ctx.fillStyle = pixel;
    ctx.fillRect(x0 + (i % SIZE) * cell, y0 + Math.floor(i / SIZE) * cell, cell, cell);
  });
}

export function toDataUrl(pixels: Pixels): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  paintPixels(ctx, pixels);
  return canvas.toDataURL();
}

export function useDressedUrl(slots: readonly Slot[], colours: AvatarColours): string {
  return useMemo(() => toDataUrl(dressedPixels(slots, colours)), [slots, colours]);
}

/** A piece cropped to its own pixels and centred in a square, for the slot icons. */
export function pieceIconUrl(pixels: Pixels): string {
  let x0 = SIZE;
  let y0 = SIZE;
  let x1 = 0;
  let y1 = 0;
  pixels.forEach((pixel, i) => {
    if (!pixel) return;
    x0 = Math.min(x0, i % SIZE);
    y0 = Math.min(y0, Math.floor(i / SIZE));
    x1 = Math.max(x1, i % SIZE);
    y1 = Math.max(y1, Math.floor(i / SIZE));
  });
  if (x1 < x0) return "";
  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const ox = Math.floor((side - (x1 - x0 + 1)) / 2) - x0;
  const oy = Math.floor((side - (y1 - y0 + 1)) / 2) - y0;
  paintPixels(ctx, pixels, ox, oy);
  return canvas.toDataURL();
}
