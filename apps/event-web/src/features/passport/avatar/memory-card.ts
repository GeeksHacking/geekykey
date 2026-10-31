import { SIZE, type Pixels } from "@/features/passport/avatar/art";
import { paintPixels } from "@/features/passport/avatar/layers";

/*
  The memory card as a picture (FRO-105): the same art-deco card the dialog tilts, drawn
  flat at 1080 by 1350, the shape phones' galleries and social apps crop least. The avatar is
  painted cell by cell rather than scaled, so it stays sharp.
*/

const WIDTH = 1080;
const HEIGHT = 1350;
const GOLD = "#d4af37";
const IVORY = "#f4f1e8";
const FONT = '"Open Sans Variable", ui-sans-serif, system-ui, sans-serif';

/** Canvas's letterSpacing is too new for some phones, so the spacing is drawn by hand. */
function spaced(ctx: CanvasRenderingContext2D, text: string, y: number, gap: number) {
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (chars.length - 1);
  let x = (WIDTH - total) / 2;
  ctx.textAlign = "left";
  chars.forEach((char, i) => {
    ctx.fillText(char, x, y);
    x += widths[i]! + gap;
  });
}

function drawCard(ctx: CanvasRenderingContext2D, avatar: Pixels, name: string) {
  const bg = ctx.createLinearGradient(0, 0, WIDTH * 0.4, HEIGHT);
  bg.addColorStop(0, "#1b1a22");
  bg.addColorStop(1, "#0c0b10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH / 2, 640, 40, WIDTH / 2, 640, 520);
  glow.addColorStop(0, "rgba(212, 175, 55, 0.22)");
  glow.addColorStop(1, "rgba(212, 175, 55, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, WIDTH - 80, HEIGHT - 80);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 68, WIDTH - 136, HEIGHT - 136);
  ctx.globalAlpha = 1;

  ctx.fillStyle = GOLD;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 34px ${FONT}`;
  spaced(ctx, "THE GRAD TEA", 160, 14);

  const cell = 26;
  paintPixels(ctx, avatar, (WIDTH - SIZE * cell) / 2, 200, cell);

  ctx.fillStyle = IVORY;
  ctx.textAlign = "center";
  let size = 72;
  do {
    ctx.font = `700 ${size}px ${FONT}`;
    size -= 4;
  } while (ctx.measureText(name).width > WIDTH - 220 && size > 32);
  ctx.fillText(name, WIDTH / 2, 1170);

  ctx.fillStyle = GOLD;
  ctx.font = `400 30px ${FONT}`;
  ctx.fillText("12 November 2026 · GeekyKey", WIDTH / 2, 1235);
}

export async function drawMemoryCard(avatar: Pixels, name: string): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`700 72px ${FONT}`),
    document.fonts.load(`600 34px ${FONT}`),
  ]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  drawCard(ctx, avatar, name);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))), "image/png");
  });
}

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `grad-tea-${slug || "guest"}.png`;
}

/**
 * On a phone, the share sheet, whose "Save image" puts it in the gallery. Elsewhere, or where
 * the browser can't share a file, a download. Closing the share sheet isn't a failure.
 */
export async function saveMemoryCard(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], fileName(name), { type: "image/png" });
  const phone = window.matchMedia("(pointer: coarse)").matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "The Grad Tea" });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
