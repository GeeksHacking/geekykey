/*
  PROTOTYPE (FRO-105), variant B: tilt card. The layers sit at different depths inside a
  CSS 3D card that follows a finger or the mouse and sways when left alone. A new piece drops
  in from above. Below it, a dressing list replaces the stamp count. CSS only, no library.
*/
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { MeResponse } from "@/api/types";

import { PieceIcon } from "@/features/passport/prototype-fro-105/pieces-ui";
import { useBodyUrl, useLayerUrl } from "@/features/passport/prototype-fro-105/use-layer-url";
import type { Outfit, Slot } from "@/features/passport/prototype-fro-105/use-outfit";

export const name = "Tilt card";

function DepthLayer({ slot, z, isNew }: { slot: Slot; z: number; isNew: boolean }) {
  const url = useLayerUrl(slot.piece.pixels);
  const style = {
    "--z": `${z}px`,
    transform: `translateZ(${z}px)`,
    animation: isNew ? "fro105-drop 700ms cubic-bezier(.2,.9,.3,1.2)" : undefined,
  } as CSSProperties;
  return (
    <img src={url} alt="" className="fro105-pixelated absolute inset-0 size-full" style={style} />
  );
}

export function VariantB({ me, outfit }: { me: MeResponse; outfit: Outfit }) {
  const body = useBodyUrl();
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const idle = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 30, y: px * 50 });
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setTilt(null), 1500);
  }

  return (
    <div className="space-y-6">
      <div
        onPointerMove={onMove}
        className="relative mx-auto aspect-[4/5] w-full max-w-sm touch-pan-y select-none [perspective:900px]"
      >
        <div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={
            tilt
              ? {
                  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                  transition: "transform 120ms",
                }
              : { animation: "fro105-sway 6s ease-in-out infinite" }
          }
        >
          {/* The art-deco frame, set back behind the figure. */}
          <div
            className="absolute inset-0 rounded-xl border-2 border-[#d4af37] bg-[linear-gradient(160deg,#1b1a22,#0c0b10)] shadow-2xl"
            style={{ transform: "translateZ(-40px)" }}
          >
            <div className="absolute inset-3 rounded-lg border border-[#d4af37]/40" />
            <div className="absolute inset-x-0 top-6 text-center text-[10px] tracking-[0.4em] text-[#d4af37]">
              THE GRAD TEA
            </div>
            <div className="absolute inset-x-0 bottom-5 text-center font-semibold tracking-wide text-[#f4f1e8]">
              {me.user.display_name}
            </div>
          </div>
          <div className="absolute inset-x-[12%] top-[10%] bottom-[14%] [transform-style:preserve-3d]">
            <img src={body} alt="" className="fro105-pixelated absolute inset-0 size-full" />
            {outfit.slots.map((slot, i) =>
              slot.worn ? (
                <DepthLayer
                  key={`${slot.piece.key}-${outfit.lastAdded?.index === i ? outfit.lastAdded.at : 0}`}
                  slot={slot}
                  z={18 + i * 8}
                  isNew={outfit.lastAdded?.index === i}
                />
              ) : null,
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Drag across the card to tilt it.</p>

      <ol className="mx-auto max-w-sm divide-y rounded-lg border" aria-label="Your outfit">
        {outfit.slots.map((slot) => {
          const isNext = outfit.next?.piece.key === slot.piece.key;
          return (
            <li key={slot.piece.key} className="flex items-center gap-3 px-3 py-2.5">
              <PieceIcon slot={slot} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{slot.piece.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {slot.stamp
                    ? `${slot.stamp.name}${slot.stamp.location ? ` · ${slot.stamp.location}` : ""}`
                    : "No booth yet"}
                </p>
              </div>
              <span className="text-xs">
                {slot.worn ? (
                  "Wearing"
                ) : isNext ? (
                  <span className="font-semibold text-[#b8911f]">Next</span>
                ) : (
                  ""
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
