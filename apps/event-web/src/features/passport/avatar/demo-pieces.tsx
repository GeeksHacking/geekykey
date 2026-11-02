import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { CHARACTERS, type CharacterKey, type Piece } from "@/features/passport/avatar/art";
import { pieceIconUrl } from "@/features/passport/avatar/layers";
import type { DemoOutfit } from "@/features/passport/avatar/use-demo-outfit";
import { cn } from "@/lib/utils";

function DemoPiece({
  piece,
  worn,
  onToggle,
}: {
  piece: Piece;
  worn: boolean;
  onToggle: () => void;
}) {
  const url = useMemo(() => pieceIconUrl(piece.layer), [piece.layer]);
  return (
    <button
      type="button"
      aria-pressed={worn}
      onClick={onToggle}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-xs",
        worn ? "border-[#d4af37]" : "border-border text-muted-foreground",
      )}
    >
      <img
        src={url}
        alt=""
        className={cn("size-7 [image-rendering:pixelated]", !worn && "opacity-40")}
      />
      {piece.label}
    </button>
  );
}

interface DemoPiecesProps {
  character: CharacterKey;
  demo: DemoOutfit;
}

/**
 * The organizers' demo toggle (FRO-105): a button for each of the character's pieces, which puts
 * it on the avatar or takes it off, and a way back to the stamps. Shown to organizers only.
 */
export function DemoPieces({ character, demo }: DemoPiecesProps) {
  const pieces = CHARACTERS[character].pieces;
  return (
    <section aria-label="Demo" className="rounded-lg border border-dashed p-3 text-center">
      <p className="text-xs text-muted-foreground">
        Demo, for organizers: tap a piece to put it on or take it off.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {pieces.map((piece) => (
          <DemoPiece
            key={piece.key}
            piece={piece}
            worn={demo.on?.includes(piece.key) ?? false}
            onToggle={() => demo.toggle(piece.key)}
          />
        ))}
      </div>
      {demo.on !== null ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={demo.reset}>
          Back to my stamps
        </Button>
      ) : null}
    </section>
  );
}
