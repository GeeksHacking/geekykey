import { useEffect, useMemo, useRef } from "react";

import type { PieceKey } from "@/features/passport/avatar/art";
import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import type { Slot } from "@/features/passport/avatar/outfit";
import { createWorld, type World } from "@/features/passport/avatar/voxel-world";

export interface VoxelStageProps {
  slots: readonly Slot[];
  colours: AvatarColours;
  /** The pieces a poll just gave, which fly in. */
  arriving: readonly PieceKey[];
  /** True on the poll that completes the outfit, which turns the figure round once. */
  completing: boolean;
  /** The first frame with the figure is on screen, so the stage can fade in. */
  onReady: () => void;
  /** The browser refused a WebGL context after all, so the flat avatar stays. */
  onFailed: () => void;
}

/** Loaded only through load-voxel-stage.ts, so three.js stays in its own file. */
export function VoxelStage({
  slots,
  colours,
  arriving,
  completing,
  onReady,
  onFailed,
}: VoxelStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let created: World;
    try {
      created = createWorld(host.current, { still, onFirstFrame: onReady });
    } catch (error) {
      console.error("Starting the avatar renderer failed", error);
      onFailed();
      return;
    }
    world.current = created;
    return () => {
      created.dispose();
      world.current = null;
    };
  }, [onReady, onFailed]);

  const worn = useMemo(
    () => slots.filter((slot) => slot.worn).map((slot) => slot.piece.key),
    [slots],
  );
  useEffect(() => {
    world.current?.setOutfit(worn, colours, arriving);
  }, [worn, colours, arriving]);

  useEffect(() => {
    if (completing) world.current?.spinOnce();
  }, [completing]);

  return <div ref={host} className="size-full" aria-hidden="true" />;
}
