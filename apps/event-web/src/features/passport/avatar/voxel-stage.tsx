import { useEffect, useRef, type ReactNode } from "react";

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
  /** What avatar-stage.tsx shows instead if this file fails to download. Unused here. */
  fallback: ReactNode;
}

/** The default export, so avatar-stage.tsx can load it with React.lazy. */
export default function VoxelStage({ slots, colours, arriving, completing }: VoxelStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const created = createWorld(host.current, { still });
    world.current = created;
    return () => {
      created.dispose();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.setOutfit(slots, colours, arriving);
  }, [slots, colours, arriving]);

  useEffect(() => {
    if (completing) world.current?.spinOnce();
  }, [completing]);

  return <div ref={host} className="size-full" aria-hidden="true" />;
}
