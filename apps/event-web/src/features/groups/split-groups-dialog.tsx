import { useState } from "react";

import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SplitGroupsForm } from "@/features/groups/split-groups-form";

/**
 * The header's shortcut (BAC-138): makes the groups and places everyone who has joined, in one
 * press. The service refuses while any group exists, so it can't overwrite a live board, and the
 * refusal shows in the dialog. The Groups board coordinates this write with every other change.
 * `joined` and `groupsExist` come from the screen's poll, which keeps running behind the dialog.
 */
export function SplitGroupsDialog({
  disabled,
  joined,
  groupsExist,
}: {
  disabled: boolean;
  joined: number;
  groupsExist: boolean;
}) {
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
        <SplitGroupsForm joined={joined} groupsExist={groupsExist} onSplit={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
