import { describeError, isApiErrorCode } from "@/api/errors";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKindsWritePending, useRemoveTokenKind } from "@/features/token-kinds/use-token-kinds";

/** A refusal stays beside the confirmation. Removal never releases a claim (agreement 10.3). */
export function RemoveKindDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const remove = useRemoveTokenKind();
  const busy = useKindsWritePending();
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this UID from the kinds list?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block break-all font-mono">{uid}</span>
            This removes its kind. You can load the UID again from the token writer's log. A claimed
            token must be released first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {describeError(remove.error)}
            {!isApiErrorCode(remove.error, "token_claimed") &&
            !isApiErrorCode(remove.error, "not_found")
              ? " Check the refreshed list before trying again."
              : null}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => remove.mutate(uid, { onSuccess: onClose })}
          >
            {busy ? "Removing" : "Remove"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
