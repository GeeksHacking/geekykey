import { CaretDown } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import type { EventGroup } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteGroupDialog } from "@/features/groups/delete-group-dialog";
import { GroupForm } from "@/features/groups/group-form";
import { useGroupBoardBusy } from "@/features/groups/use-group-board";
import { returnFocusOnClose } from "@/lib/dialog-focus";

/**
 * A group's Actions menu, with the dialogs it opens. Delete always asks first: the spec asks it
 * for a group with members, and a group that looks empty may have taken a latecomer since the
 * last poll.
 */
export function GroupActions({ group }: { group: EventGroup }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const busy = useGroupBoardBusy();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            disabled={busy}
            type="button"
            variant="outline"
            size="sm"
            className="border-border bg-transparent hover:border-input hover:bg-secondary hover:text-foreground data-[state=open]:border-input data-[state=open]:bg-secondary pointer-coarse:h-11"
            aria-label={`Actions for ${group.name}`}
          >
            Actions
            <CaretDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem disabled={busy} onSelect={() => setDialog("edit")}>
            Edit group…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setDialog("delete")}
          >
            Delete group…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog === "edit"} onOpenChange={(open) => setDialog(open ? "edit" : null)}>
        <DialogContent onCloseAutoFocus={(event) => returnFocusOnClose(event, trigger.current)}>
          <CornerBrackets />
          <GroupForm group={group} onSaved={() => setDialog(null)} />
        </DialogContent>
      </Dialog>
      <DeleteGroupDialog
        group={group}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        returnFocusTo={trigger}
      />
    </div>
  );
}
