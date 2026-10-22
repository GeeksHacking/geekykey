import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DisplayNameForm } from "@/features/passport/display-name-form";

/**
 * The name the event shows, and a way to change it at any time (agreement 8.7): for a
 * guest who skipped the prompt, and for a Google user who would rather not show their
 * full Google name.
 */
export function DisplayNameRow({ displayName }: { displayName: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-muted-foreground">
        Shown as <span className="font-medium text-foreground">{displayName ?? "Participant"}</span>
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <PencilSimple aria-hidden />
          Change name
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change name</DialogTitle>
            <DialogDescription>The name the event shows for you.</DialogDescription>
          </DialogHeader>
          <DisplayNameForm defaultName={displayName ?? ""} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
