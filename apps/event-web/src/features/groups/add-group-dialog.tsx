import { Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AddGroupForm } from "@/features/groups/add-group-form";

export function AddGroupDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus aria-hidden />
          Create group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <CornerBrackets />
        <AddGroupForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
