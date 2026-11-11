import { type RefObject, useState } from "react";

import { describeError } from "@/api/errors";
import type { EventGroup } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGroupBoardChange } from "@/features/groups/use-group-board";
import { returnFocusOnClose } from "@/lib/dialog-focus";

/** What happens to a deleted group's members, by how many there were at the last poll. */
function membersSentence(count: number): string {
  if (count === 0) return "Nobody is in it.";
  const who = count === 1 ? "Its 1 member goes" : `Its ${count} members go`;
  return `${who} back to the waiting list. Press Allocate to place them again.`;
}

/**
 * Asks before deleting a group (the spec's user story 12), as the station board's disable alert
 * asks. Its members, if any, go back to the waiting list. Radix mounts the content only once it opens, so the delete call lives in
 * the confirmation below.
 */
export function DeleteGroupDialog({
  group,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  group: EventGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The group's Actions button, which takes the keyboard back when the alert closes. */
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => returnFocusOnClose(event, returnFocusTo.current)}
      >
        <CornerBrackets />
        <DeleteGroupConfirm group={group} onDeleted={() => onOpenChange(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteGroupConfirm({ group, onDeleted }: { group: EventGroup; onDeleted: () => void }) {
  const deleteGroup = useGroupBoardChange();
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await deleteGroup.mutateAsync({ type: "delete", groupId: group.id });
      onDeleted();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
        <AlertDialogDescription>{membersSentence(group.members.length)}</AlertDialogDescription>
      </AlertDialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteGroup.busy}>Cancel</AlertDialogCancel>
        {/* AlertDialogAction is a Close, so preventDefault holds the alert open until the call
            has answered, and a refusal has somewhere to show. */}
        <AlertDialogAction
          disabled={deleteGroup.busy}
          onClick={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          {deleteGroup.isPending ? "Deleting" : "Delete"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
