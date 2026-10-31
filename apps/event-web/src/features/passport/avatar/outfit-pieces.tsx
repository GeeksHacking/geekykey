import { useMemo } from "react";

import type { PieceKey } from "@/features/passport/avatar/art";
import { pieceIconUrl } from "@/features/passport/avatar/layers";
import type { Outfit, Slot } from "@/features/passport/avatar/outfit";
import { formatCount, pointsUnit } from "@/lib/format";
import { cn } from "@/lib/utils";

function PieceIcon({ slot }: { slot: Slot }) {
  const url = useMemo(() => pieceIconUrl(slot.piece.pixels), [slot.piece.pixels]);
  return (
    <img
      src={url}
      alt=""
      className={cn(
        "size-8 [image-rendering:pixelated]",
        !slot.worn && "opacity-30 brightness-0 dark:invert",
      )}
    />
  );
}

interface OutfitPiecesProps {
  outfit: Outfit;
  points: number;
  /** The pieces the last poll gave, and whether it raised the points, for the change marks. */
  arriving: readonly PieceKey[];
  pointsRose: boolean;
}

/**
 * The six piece icons, and under them the caption that replaced the points and stamp count
 * (FRO-105). A piece not yet worn shows as a grey shape, and says so to a screen reader. The
 * `data-changed` marks are the dashboard's usual ones (use-passport-changes.ts): a phone pops
 * the new piece's icon, and a desktop counts the points up.
 */
export function OutfitPieces({ outfit, points, arriving, pointsRose }: OutfitPiecesProps) {
  return (
    <div className="text-center">
      <ul className="flex justify-center gap-3" aria-label="Your outfit">
        {outfit.slots.map((slot) => (
          <li
            key={slot.piece.key}
            title={`${slot.piece.label}, from ${slot.stamp.name}`}
            data-changed={arriving.includes(slot.piece.key) ? "piece" : undefined}
            className="flex flex-col items-center gap-1.5 phone-change:animate-in phone-change:zoom-in-50 phone-change:duration-200"
          >
            <PieceIcon slot={slot} />
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                slot.worn ? "bg-[#d4af37]" : "border border-muted-foreground",
              )}
            />
            <span className="sr-only">
              {slot.piece.label}, from {slot.stamp.name}: {slot.worn ? "wearing" : "not yet"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        {outfit.worn} of {outfit.slots.length} {outfit.slots.length === 1 ? "piece" : "pieces"} ·{" "}
        <span
          key={points}
          data-changed={pointsRose ? "points" : undefined}
          className="inline-block font-mono phone-change:animate-in phone-change:fade-in-0 phone-change:slide-in-from-bottom-2 phone-change:duration-200"
        >
          {formatCount(points)}
        </span>{" "}
        {pointsUnit(points)}
      </p>
    </div>
  );
}
