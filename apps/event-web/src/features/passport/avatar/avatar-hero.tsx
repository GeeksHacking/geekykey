import { useMemo } from "react";

import type { MeResponse } from "@/api/types";
import { PageHeading } from "@/components/layout/page-heading";
import { AvatarStage } from "@/features/passport/avatar/avatar-stage";
import { ColoursDialog } from "@/features/passport/avatar/colours-dialog";
import { useDressedUrl } from "@/features/passport/avatar/layers";
import { MemoryCardDialog } from "@/features/passport/avatar/memory-card-dialog";
import { outfitFrom } from "@/features/passport/avatar/outfit";
import { OutfitPieces } from "@/features/passport/avatar/outfit-pieces";
import { useAvatarColours } from "@/features/passport/avatar/use-avatar-colours";
import type { PassportChanges } from "@/features/passport/passport-changes";

interface AvatarHeroProps {
  me: MeResponse;
  /** What the last poll changed: a new stamp's piece flies in, and the last one also spins. */
  changes: PassportChanges;
}

/**
 * The grad tea's dashboard lead (FRO-105): the guest's avatar, dressed one piece per stamp,
 * then the pieces and a caption with the counts the points summary used to show.
 */
export function AvatarHero({ me, changes }: AvatarHeroProps) {
  const outfit = useMemo(() => outfitFrom(me.stamps), [me.stamps]);
  const { colours } = useAvatarColours(me.user.id);
  const flatUrl = useDressedUrl(outfit.slots, colours);
  const arriving = useMemo(
    () =>
      outfit.slots
        .filter((slot) => changes.stamped.includes(slot.stamp.station_id))
        .map((slot) => slot.piece.key),
    [outfit.slots, changes.stamped],
  );
  const name = me.user.display_name ?? "Guest";

  return (
    <section aria-label="Your avatar" className="space-y-5">
      <AvatarStage
        slots={outfit.slots}
        colours={colours}
        arriving={arriving}
        completing={outfit.complete && arriving.length > 0}
        flatUrl={flatUrl}
        title={
          <>
            <p className="text-[10px] tracking-[0.4em] text-[#d4af37]">THE GRAD TEA</p>
            <div className="mt-1 text-[#f4f1e8]">
              <PageHeading>{name}</PageHeading>
            </div>
          </>
        }
      />
      <OutfitPieces
        outfit={outfit}
        points={me.points}
        arriving={arriving}
        pointsRose={changes.points !== null}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <MemoryCardDialog slots={outfit.slots} colours={colours} name={name} />
        <ColoursDialog userId={me.user.id} />
      </div>
    </section>
  );
}
