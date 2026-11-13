import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";

import type { PieceKey } from "@/features/passport/avatar/art";
import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { Confetti } from "@/features/passport/avatar/confetti";
import { FlatAvatar } from "@/features/passport/avatar/flat-avatar";
import { loadVoxelStage } from "@/features/passport/avatar/load-voxel-stage";
import type { Slot } from "@/features/passport/avatar/outfit";
import type { VoxelStageProps } from "@/features/passport/avatar/voxel-stage";
import { hasWebGL } from "@/features/passport/avatar/webgl";
import { cn } from "@/lib/utils";

type Phase = "loading" | "ready" | "unsupported" | "failed";

/**
 * What the line under the stage says. Loading and the two fallbacks are in section 13 of
 * agreement 0.14 (FRO-164); "Drag to turn" is the line that was already there.
 */
const MESSAGE: Record<Phase, string> = {
  loading: "Loading your avatar in 3D...",
  ready: "Drag to turn",
  unsupported: "3D isn't available in this browser.",
  failed: "3D couldn't load. Your avatar is still here.",
};

interface AvatarStageProps {
  slots: readonly Slot[];
  colours: AvatarColours;
  arriving: readonly PieceKey[];
  completing: boolean;
  flatUrl: string;
  /** The page heading and the event's name, above the stage. */
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
  const [phase, setPhase] = useState<Phase>(webgl ? "loading" : "unsupported");
  const [Stage, setStage] = useState<ComponentType<VoxelStageProps> | null>(null);

  const onReady = useCallback(() => setPhase((now) => (now === "loading" ? "ready" : now)), []);
  const onFailed = useCallback(() => setPhase("failed"), []);

  useEffect(() => {
    if (!webgl) return;
    let cancelled = false;
    loadVoxelStage().then(
      (module) => {
        if (!cancelled) setStage(() => module.VoxelStage);
      },
      () => {
        if (!cancelled) setPhase("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [webgl]);

  const ready = phase === "ready";

  return (
    <div className="space-y-4">
      <div className="px-4 text-center">{title}</div>
      <div className="relative h-[26rem] overflow-hidden sm:h-[28rem]">
        <div
          className={cn("absolute inset-0 transition-opacity duration-300", ready && "opacity-0")}
        >
          <FlatAvatar url={flatUrl} spinning={completing && !ready} />
        </div>
        {Stage && phase !== "failed" ? (
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              ready ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <Stage
              slots={slots}
              colours={colours}
              arriving={arriving}
              completing={completing}
              onReady={onReady}
              onFailed={onFailed}
            />
          </div>
        ) : null}
        {completing ? <Confetti /> : null}
        <p
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground",
            phase === "loading" && "motion-safe:animate-pulse",
          )}
        >
          {MESSAGE[phase]}
        </p>
      </div>
    </div>
  );
}
