/*
  PROTOTYPE (FRO-105), variant C: voxel stage. A dark stage with the avatar as cubes, built
  from the same layers. Drag to spin; a new piece's cubes fly in and snap into place. The flat
  avatar shows until three.js has loaded, which is also the fallback the real one would keep.
*/
import { lazy, Suspense } from "react";

import type { MeResponse } from "@/api/types";

import { NextPieceLine, PieceIcon } from "@/features/passport/prototype-fro-105/pieces-ui";
import { useBodyUrl } from "@/features/passport/prototype-fro-105/use-layer-url";
import type { Outfit } from "@/features/passport/prototype-fro-105/use-outfit";

export const name = "Voxel stage";

const VoxelStage = lazy(() => import("@/features/passport/prototype-fro-105/voxel-stage"));

function FlatFallback() {
  const body = useBodyUrl();
  return <img src={body} alt="" className="fro105-pixelated mx-auto h-full" />;
}

export function VariantC({ me, outfit }: { me: MeResponse; outfit: Outfit }) {
  return (
    <div className="-mx-4 space-y-5 sm:mx-0">
      <div className="relative h-[440px] overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#3a2f12_0%,#121016_55%,#07060a_100%)] sm:rounded-xl">
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 text-center">
          <p className="text-[10px] tracking-[0.4em] text-[#d4af37]">THE GRAD TEA</p>
          <p className="mt-1 text-xl font-semibold text-[#f4f1e8]">{me.user.display_name}</p>
        </div>
        <Suspense fallback={<FlatFallback />}>
          <VoxelStage slots={outfit.slots} lastAdded={outfit.lastAdded} />
        </Suspense>
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-[#f4f1e8]/60">
          Drag to turn
        </p>
      </div>

      <div className="px-4 sm:px-0">
        <ul className="flex justify-center gap-3" aria-label="Outfit pieces">
          {outfit.slots.map((slot) => (
            <li
              key={slot.piece.key}
              title={slot.piece.label}
              className="flex flex-col items-center gap-1"
            >
              <PieceIcon slot={slot} className="size-8" />
              <span
                className={
                  slot.worn
                    ? "size-1.5 rounded-full bg-[#d4af37]"
                    : "size-1.5 rounded-full bg-muted"
                }
              />
            </li>
          ))}
        </ul>
        <NextPieceLine outfit={outfit} className="mt-4 text-center text-sm" />
      </div>
    </div>
  );
}
