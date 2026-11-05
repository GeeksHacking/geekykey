import { useState } from "react";

import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SplitGroupsForm } from "@/features/groups/split-groups-form";

/**
 * The header's shortcut (BAC-138): makes the groups and places everyone who has joined, in one
 * press. The service refuses while any group exists, so it can't overwrite a live board, and the
 * refusal shows in the dialog. The dialog covers Allocate and Reset while a split is sent, and
 * `disabled` covers the other way, so the boards they answer with can't arrive out of order.
 */
export function SplitGroupsDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Split into groups
        </Button>
      </DialogTrigger>
      <DialogContent>
        <CornerBrackets />
        <SplitGroupsForm onSplit={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
