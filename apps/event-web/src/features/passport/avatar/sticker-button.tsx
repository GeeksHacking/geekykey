import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import type { Slot } from "@/features/passport/avatar/outfit";
import { drawSticker, saveSticker } from "@/features/passport/avatar/sticker";

interface StickerButtonProps {
  slots: readonly Slot[];
  colours: AvatarColours;
  /** The id of the line that tells the guest how to use the picture. */
  describedBy?: string;
}

type Drawn = { key: string; state: "ready"; blob: Blob } | { key: string; state: "failed" };

/** What the picture depends on: the worn pieces, in order, and the guest's colours. */
function stickerKey(slots: readonly Slot[], colours: AvatarColours): string {
  const pieces = slots.map((slot) => `${slot.piece.key}:${slot.worn ? "worn" : "empty"}`).join(",");
  return `${pieces}|${colours.character}|${colours.skin}|${colours.hair}|${colours.suit}`;
}

/**
 * Saves the avatar as a sticker (FRO-115): a 512 by 512 PNG with no background, shared from
 * a phone or downloaded from a laptop. The picture is drawn as the dashboard loads, so the
 * press that opens the share sheet is the whole gesture. Safari only opens the sheet while
 * the press is fresh.
 */
export function StickerButton({ slots, colours, describedBy }: StickerButtonProps) {
  const key = stickerKey(slots, colours);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [attempt, setAttempt] = useState(0);
  const last = useRef<{ key: string; attempt: number } | null>(null);
  // A picture from another outfit or another colour is not this guest's sticker.
  const sticker = drawn?.key === key ? drawn : null;

  useEffect(() => {
    if (last.current?.key === key && last.current.attempt === attempt) return;
    last.current = { key, attempt };
    let current = true;
    drawSticker(slots, colours).then(
      (blob) => current && setDrawn({ key, state: "ready", blob }),
      () => current && setDrawn({ key, state: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [slots, colours, attempt, key]);

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="outline"
        disabled={sticker === null}
        aria-busy={sticker === null}
        aria-describedby={describedBy}
        onClick={() => {
          if (sticker?.state === "ready") void saveSticker(sticker.blob);
          else if (sticker?.state === "failed") {
            setDrawn(null);
            setAttempt((count) => count + 1);
          }
        }}
      >
        Save as sticker
      </Button>
      {sticker?.state === "failed" ? (
        <p role="alert" className="text-sm text-destructive-text">
          Couldn't make the sticker. Try again.
        </p>
      ) : null}
    </div>
  );
}
