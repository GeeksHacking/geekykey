import { useRef } from "react";
import { toast } from "sonner";

import { describeError, isApiError, isApiErrorCode } from "@/api/errors";
import type { AdminKindToken } from "@/api/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ClaimedKindToken } from "@/features/token-kinds/kind-token-view";
import { useKindsWritePending, useReleaseKindToken } from "@/features/token-kinds/use-token-kinds";

/** A reply that never came, or a 5xx: 8.3 says the claim may have gone anyway. */
const mayHaveReleased = (error: unknown) => !isApiError(error) || error.status >= 500;

/**
 * Release from the kinds list (agreement 8.3). `confirmed` is the row as it was when the
 * admin pressed Release, and its owner is the one sent, so a newer claim is never
 * released. `current` is the same UID in the list as it stands now, or undefined once it
 * has left the list.
 *
 * One dialog sends at most one release. After a failure it shows what the refreshed list
 * says and offers only Close, so another attempt starts from a fresh row and a fresh
 * confirmation, never from a retry.
 */
export function ReleaseKindTokenDialog({
  confirmed,
  current,
  listState,
  onClose,
}: {
  confirmed: ClaimedKindToken;
  current: AdminKindToken | undefined;
  /** Whether the list is being read again, or its last read failed and `current` is old. */
  listState: "fresh" | "refreshing" | "failed";
  onClose: () => void;
}) {
  const release = useReleaseKindToken();
  const busy = useKindsWritePending();
  const sent = useRef(false);
  // The cached row, which a refetch replaces only once it answers.
  const ownerChanged = release.isIdle && current?.owner_id !== confirmed.owner_id;
  const canRelease = release.isIdle && !ownerChanged;

  function send() {
    if (sent.current) return;
    sent.current = true;
    release.mutate(
      { uid: confirmed.uid, ownerId: confirmed.owner_id },
      {
        onSuccess: () => {
          toast.success(`Released ${confirmed.uid}. Anyone can claim it now.`);
          onClose();
        },
      },
    );
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !release.isPending) onClose();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (release.isPending) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Release this token?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone will be able to claim it again. Its kind, earlier taps, connections and points
            stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <dt className="text-muted-foreground">UID</dt>
          <dd className="break-all font-mono">{confirmed.uid}</dd>
          <dt className="text-muted-foreground">Owner ID</dt>
          <dd className="break-all font-mono">{confirmed.owner_id}</dd>
        </dl>
        {ownerChanged ? (
          <p role="alert" className="text-sm text-destructive-text">
            This token's owner has changed since you opened this. Close it and check the list.
          </p>
        ) : null}
        {release.isError ? (
          <div role="alert" className="space-y-1 text-sm">
            <p className="text-destructive-text">
              {isApiErrorCode(release.error, "not_found")
                ? "Someone else has claimed this token now, or it has already been released."
                : describeError(release.error)}
              {mayHaveReleased(release.error) ? " The release may have gone through." : null}
            </p>
            <p className="break-words [overflow-wrap:anywhere]">
              {refreshedOwnership(current, listState)}
            </p>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={release.isPending}>
            {canRelease || release.isPending ? "Cancel" : "Close"}
          </AlertDialogCancel>
          {canRelease || release.isPending ? (
            <Button disabled={busy} onClick={send}>
              {release.isPending ? "Releasing" : "Release token"}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** What the list says after a failed release, so the admin checks before another try. */
function refreshedOwnership(
  current: AdminKindToken | undefined,
  listState: "fresh" | "refreshing" | "failed",
) {
  if (listState === "refreshing") return "Refreshing the list.";
  // TanStack keeps the last good list when a refetch fails, so it says nothing about now.
  if (listState === "failed") return "Couldn't check the list. Refresh it before releasing again.";
  if (current === undefined) return "The refreshed list no longer shows this token.";
  if (current.owner_id === null) return "The refreshed list shows it unclaimed.";
  return `The refreshed list shows it claimed by ${current.owner_id}.`;
}
