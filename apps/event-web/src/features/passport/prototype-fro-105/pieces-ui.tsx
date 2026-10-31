/* PROTOTYPE (FRO-105), throwaway. Small pieces the three variants share. */
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { SIZE } from "@/features/passport/prototype-fro-105/art";
import type { Outfit, Slot } from "@/features/passport/prototype-fro-105/use-outfit";

/** Keyframes the variants use. Phones would get these too: CSS only. */
export function PrototypeStyles() {
  return (
    <style>{`
      @keyframes fro105-pop {
        0% { transform: scale(1.5); filter: brightness(2.2); opacity: 0; }
        60% { transform: scale(0.95); filter: brightness(1.4); opacity: 1; }
        100% { transform: scale(1); filter: none; }
      }
      @keyframes fro105-drop {
        0% { transform: translate3d(0, -140px, 120px); opacity: 0; }
        70% { transform: translate3d(0, 6px, var(--z)); opacity: 1; }
        100% { transform: translate3d(0, 0, var(--z)); }
      }
      @keyframes fro105-sway {
        0%, 100% { transform: rotateX(4deg) rotateY(-14deg); }
        50% { transform: rotateX(-2deg) rotateY(14deg); }
      }
      .fro105-pixelated { image-rendering: pixelated; }
    `}</style>
  );
}

/** A piece cropped to its own pixels, for the slot icons. */
export function PieceIcon({ slot, className }: { slot: Slot; className?: string }) {
  const url = useMemo(() => {
    const px = slot.piece.pixels;
    let x0 = SIZE;
    let y0 = SIZE;
    let x1 = 0;
    let y1 = 0;
    px.forEach((c, i) => {
      if (!c) return;
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    });
    const side = Math.max(x1 - x0, y1 - y0) + 1;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const ox = Math.floor((side - (x1 - x0 + 1)) / 2);
    const oy = Math.floor((side - (y1 - y0 + 1)) / 2);
    px.forEach((c, i) => {
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect((i % SIZE) - x0 + ox, Math.floor(i / SIZE) - y0 + oy, 1, 1);
    });
    return canvas.toDataURL();
  }, [slot.piece.pixels]);
  return (
    <img
      src={url}
      alt=""
      className={cn(
        "fro105-pixelated",
        !slot.worn && "opacity-25 [filter:brightness(0)_invert(0.5)]",
        className,
      )}
    />
  );
}

/** Where the next piece is. Uses the first empty slot until FRO-107 brings next_stop. */
export function NextPieceLine({ outfit, className }: { outfit: Outfit; className?: string }) {
  if (!outfit.next) {
    return <p className={className}>Fully dressed. Enjoy the party.</p>;
  }
  const where = outfit.next.stamp
    ? `${outfit.next.stamp.name}${outfit.next.stamp.location ? `, ${outfit.next.stamp.location}` : ""}`
    : "a booth not set up yet";
  return (
    <p className={className}>
      Next: the {outfit.next.piece.label.toLowerCase()} is at {where}.
    </p>
  );
}
