import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { dressedPixels } from "@/features/passport/avatar/layers";
import { drawMemoryCard, saveMemoryCard } from "@/features/passport/avatar/memory-card";
import type { Slot } from "@/features/passport/avatar/outfit";
import { TiltCard } from "@/features/passport/avatar/tilt-card";

interface MemoryCardDialogProps {
  slots: readonly Slot[];
  colours: AvatarColours;
  name: string;
}

type Picture = { state: "drawing" } | { state: "ready"; blob: Blob } | { state: "failed" };

/**
 * The guest's card from the grad tea, to keep (FRO-105). The picture is drawn as the dialog
 * opens, so Save hands it to the phone's share sheet straight from the press: Safari opens
 * the sheet only while the press is fresh.
 */
export function MemoryCardDialog({ slots, colours, name }: MemoryCardDialogProps) {
  const [open, setOpen] = useState(false);
  const [picture, setPicture] = useState<Picture>({ state: "drawing" });

  useEffect(() => {
    if (!open) return;
    let current = true;
    drawMemoryCard(dressedPixels(slots, colours), name).then(
      (blob) => current && setPicture({ state: "ready", blob }),
      () => current && setPicture({ state: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [open, slots, colours, name]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPicture({ state: "drawing" });
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Show my card</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Your Grad Tea card</DialogTitle>
          <DialogDescription>Save it as a picture to remember the grad tea.</DialogDescription>
        </DialogHeader>
        <TiltCard slots={slots} colours={colours} name={name} />
        {picture.state === "failed" ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't make the picture. Close this and try again.
          </p>
        ) : null}
        <Button
          disabled={picture.state !== "ready"}
          onClick={() => {
            if (picture.state === "ready") void saveMemoryCard(picture.blob, name);
          }}
        >
          Save picture
        </Button>
      </DialogContent>
    </Dialog>
  );
}
