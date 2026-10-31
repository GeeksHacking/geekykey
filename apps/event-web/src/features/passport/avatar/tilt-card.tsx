import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { BODY } from "@/features/passport/avatar/art";
import { recolour, type AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { toDataUrl } from "@/features/passport/avatar/layers";
import type { Slot } from "@/features/passport/avatar/outfit";

/*
  Prototype variant B, kept as the memory card (FRO-105): the body and each worn piece sit at
  different depths inside a CSS 3D card that follows a finger and sways when left alone.
  CSS only. The picture saved from it is drawn flat by memory-card.ts.
*/
export function TiltCard({
  slots,
  colours,
  name,
}: {
  slots: readonly Slot[];
  colours: AvatarColours;
  name: string;
}) {
  const body = useMemo(() => toDataUrl(recolour(BODY, colours)), [colours]);
  const pieces = useMemo(
    () =>
      slots
        .filter((slot) => slot.worn)
        .map((slot) => ({ key: slot.piece.key, url: toDataUrl(slot.piece.pixels) })),
    [slots],
  );
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const idle = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  function follow(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 30, y: px * 50 });
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setTilt(null), 1500);
  }

  return (
    <div
      onPointerMove={follow}
      className="relative mx-auto aspect-[4/5] w-full max-w-xs touch-pan-y select-none [perspective:900px]"
    >
      <div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={
          tilt
            ? {
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                transition: "transform 150ms",
              }
            : { animation: "avatar-sway 6s ease-in-out infinite" }
        }
      >
        <div
          className="absolute inset-0 rounded-lg border-2 border-[#d4af37] bg-[linear-gradient(160deg,#1b1a22,#0c0b10)] shadow-2xl"
          style={{ transform: "translateZ(-40px)" }}
        >
          <div className="absolute inset-3 rounded-lg border border-[#d4af37]/40" />
          <p className="absolute inset-x-0 top-6 text-center text-[10px] tracking-[0.4em] text-[#d4af37]">
            THE GRAD TEA
          </p>
          <p className="absolute inset-x-4 bottom-5 truncate text-center font-semibold tracking-wide text-[#f4f1e8]">
            {name}
          </p>
        </div>
        <div className="absolute inset-x-[14%] top-[15%] bottom-[13%] [transform-style:preserve-3d]">
          <img
            src={body}
            alt=""
            className="absolute inset-0 size-full [image-rendering:pixelated]"
          />
          {pieces.map((piece, i) => (
            <img
              key={piece.key}
              src={piece.url}
              alt=""
              className="absolute inset-0 size-full [image-rendering:pixelated]"
              style={{ transform: `translateZ(${18 + i * 8}px)` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
