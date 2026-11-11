import { useState } from "react";

import { describeError } from "@/api/errors";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useGroupBoardChange } from "@/features/groups/use-group-board";

/**
 * The header's Reset, for another timed trial with the same groups (the spec's user stories 37
 * and 38). It always asks first, as deleting a group does, so a live event isn't cleared by
 * accident. Radix mounts the content only once it opens, so each opening starts without the last
 * one's error.
 */
export function ResetGroupsDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Reset
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <CornerBrackets />
        <ResetGroupsConfirm onDone={() => setOpen(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetGroupsConfirm({ onDone }: { onDone: () => void }) {
  const reset = useGroupBoardChange();
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await reset.mutateAsync({ type: "reset" });
      onDone();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Reset the groups?</AlertDialogTitle>
        <AlertDialogDescription>
          Everyone leaves their group and has to join again, and Allocate starts over. The groups
          stay as they are. Download the CSV first to keep this trial's times.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={reset.busy}>Cancel</AlertDialogCancel>
        {/* AlertDialogAction is a Close, so preventDefault holds the alert open until the call
            has answered, and a refusal has somewhere to show. */}
        <AlertDialogAction
          disabled={reset.busy}
          onClick={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          {reset.isPending ? "Resetting" : "Reset"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
