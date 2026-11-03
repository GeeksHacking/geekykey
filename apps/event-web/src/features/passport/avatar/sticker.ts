import { SIZE } from "@/features/passport/avatar/art";
import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { dressedPixels, paintPixels } from "@/features/passport/avatar/layers";
import type { Slot } from "@/features/passport/avatar/outfit";
import { shareOrDownload } from "@/features/passport/avatar/share-file";
import { hasWebGL } from "@/features/passport/avatar/webgl";

const STICKER_SIZE = 512;

export type StickerMode = "auto" | "3d" | "flat";

/** The sticker as a file, under the name the ticket gives it. */
export function stickerFile(blob: Blob): File {
  return new File([blob], "my-avatar.png", { type: "image/png" });
}

/**
 * Which renderer makes the sticker: the 3D figure by default, or the flat pixel art where
 * there is no WebGL. In development the query can force either, so both can be compared on
 * one phone. It is ignored in a production build.
 */
export function stickerMode(
  search = window.location.search,
  dev = import.meta.env.DEV,
): StickerMode {
  if (!dev) return "auto";
  const value = new URLSearchParams(search).get("sticker");
  return value === "3d" || value === "flat" ? value : "auto";
}

function drawFlatSticker(slots: readonly Slot[], colours: AvatarColours): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = STICKER_SIZE;
  canvas.height = STICKER_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("No 2D canvas"));
  const cell = Math.floor(STICKER_SIZE / SIZE);
  const offset = Math.floor((STICKER_SIZE - SIZE * cell) / 2);
  paintPixels(ctx, dressedPixels(slots, colours), offset, offset, cell);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))), "image/png");
  });
}

/**
 * The avatar as a 512 by 512 transparent PNG (FRO-115). It uses the dashboard's cubes when
 * the phone can draw them, and the flat pixel art otherwise, including when the 3D frame
 * fails. The dev query can force one path for a side-by-side check.
 */
export async function drawSticker(
  slots: readonly Slot[],
  colours: AvatarColours,
  mode = stickerMode(),
): Promise<Blob> {
  if (mode !== "flat" && hasWebGL()) {
    try {
      const { renderStickerBlob } = await import("@/features/passport/avatar/sticker-3d");
      return await renderStickerBlob(slots, colours, STICKER_SIZE);
    } catch {
      // A refused context or a failed frame still leaves the flat sticker.
    }
  }
  return drawFlatSticker(slots, colours);
}

/** Shares the sticker on a phone, or downloads it elsewhere. */
export async function saveSticker(blob: Blob): Promise<void> {
  await shareOrDownload(stickerFile(blob));
}
