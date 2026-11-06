import { Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { GroupForm } from "@/features/groups/group-form";

export function AddGroupDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Plus aria-hidden />
          Create group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <CornerBrackets />
        <GroupForm onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
