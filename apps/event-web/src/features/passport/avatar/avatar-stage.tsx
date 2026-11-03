import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";

import type { VoxelStageProps } from "@/features/passport/avatar/voxel-stage";

import type { PieceKey } from "@/features/passport/avatar/art";
import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { Confetti } from "@/features/passport/avatar/confetti";
import { FlatAvatar } from "@/features/passport/avatar/flat-avatar";
import type { Slot } from "@/features/passport/avatar/outfit";
import { hasWebGL } from "@/features/passport/avatar/webgl";

/*
  three.js comes through import() only, so the dashboard paints with the flat avatar first
  and the cubes replace it once their file has loaded. A phone without WebGL, or a download
  that fails, keeps the flat avatar.
*/
const VoxelStage = lazy((): Promise<{ default: ComponentType<VoxelStageProps> }> =>
  import("@/features/passport/avatar/voxel-stage").then(
    (module) => ({ default: module.VoxelStage }),
    () => ({ default: ({ fallback }: VoxelStageProps) => fallback }),
  ),
);

interface AvatarStageProps {
  slots: readonly Slot[];
  colours: AvatarColours;
  arriving: readonly PieceKey[];
  completing: boolean;
  flatUrl: string;
  /** The page heading and the event's name, laid over the top of the stage. */
  title: ReactNode;
}

export function AvatarStage({
  slots,
  colours,
  arriving,
  completing,
  flatUrl,
  title,
}: AvatarStageProps) {
  const [webgl] = useState(hasWebGL);
  const flat = <FlatAvatar url={flatUrl} spinning={completing} />;
  return (
    // No background of its own: the figure stands on the page, in either theme.
    <div className="relative h-[26rem] overflow-hidden sm:h-[28rem]">
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 px-4 text-center">
        {title}
      </div>
      {webgl ? (
        <Suspense fallback={flat}>
          <VoxelStage
            slots={slots}
            colours={colours}
            arriving={arriving}
            completing={completing}
            fallback={flat}
          />
        </Suspense>
      ) : (
        flat
      )}
      {completing ? <Confetti /> : null}
      {webgl ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">
          Drag to turn
        </p>
      ) : null}
    </div>
  );
}
