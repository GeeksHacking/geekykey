import { useMemo } from "react";

import type { MeResponse } from "@/api/types";
import { PageHeading } from "@/components/layout/page-heading";
import { AvatarStage } from "@/features/passport/avatar/avatar-stage";
import { ColoursDialog } from "@/features/passport/avatar/colours-dialog";
import { DemoPieces } from "@/features/passport/avatar/demo-pieces";
import { useDressedUrl } from "@/features/passport/avatar/layers";
import { MemoryCardDialog } from "@/features/passport/avatar/memory-card-dialog";
import { demoOutfitFrom, outfitFrom } from "@/features/passport/avatar/outfit";
import { OutfitPieces } from "@/features/passport/avatar/outfit-pieces";
import { useAvatarColours } from "@/features/passport/avatar/use-avatar-colours";
import { useDemoOutfit } from "@/features/passport/avatar/use-demo-outfit";
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
  const { colours } = useAvatarColours(me.user.id);
  const isOrganizer = me.user.role === "organizer";
  const demo = useDemoOutfit();
  const demoOn = isOrganizer ? demo.on : null;
  const outfit = useMemo(
    () =>
      demoOn === null
        ? outfitFrom(me.stamps, colours.character)
        : demoOutfitFrom(me.stamps, colours.character, demoOn),
    [me.stamps, colours.character, demoOn],
  );
  const flatUrl = useDressedUrl(outfit.slots, colours);
  const stamped = useMemo(
    () =>
      outfit.slots
        .filter((slot) => changes.stamped.includes(slot.stamp.station_id))
        .map((slot) => slot.piece.key),
    [outfit.slots, changes.stamped],
  );
  const arriving = demoOn === null ? stamped : demo.arriving;
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
            <p className="look-label text-primary-text">The grad tea</p>
            <div className="mt-1">
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
      {isOrganizer ? <DemoPieces character={colours.character} demo={demo} /> : null}
    </section>
  );
}
