import { useState } from "react";

import { describeError } from "@/api/errors";
import type { EventStationBoardStation, StationKeyResponse } from "@/api/types";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StationKeyReveal } from "@/features/stations/station-key-reveal";
import { useReplaceStationKey } from "@/features/stations/use-replace-station-key";

/** FRO-28's own sentence, from the 8 Oct decision that took a reflash out of this. */
const CONFIRMATION =
  "The old key stops working within a minute. Zi Tao has to enter the new key in the station's setup mode before it can send taps again.";

/**
 * FRO-28's confirmation, then FRO-24's one-time key, in two dialogs.
 *
 * They cannot be one. FRO-28 asks for shadcn's alert dialog, whose title and description come
 * from @radix-ui/react-alert-dialog with their own title context. FRO-24's reveal is built on
 * the dialog package's own and throws "DialogTitle must be used within Dialog" inside an alert
 * dialog, so the alert asks and then steps aside.
 *
 * Nothing here needs an API client. Radix mounts dialog content only once it opens, so the
 * mutation sits in the content below rather than here, which is what leaves StationBoard
 * renderable with no provider. That is how PassportStationDialog already does it.
 */
export function ReplaceStationKeyDialog({
  station,
  open,
  onOpenChange,
}: {
  station: EventStationBoardStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<StationKeyResponse | null>(null);

  return (
    <>
      <AlertDialog open={open && result === null} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <ReplaceStationKeyConfirm
            station={station}
            onReplaced={(next) => {
              // The alert is asked once per replacement and 9.8 returns the key once, so
              // there is nothing left to ask. Closing it frees the screen for the key.
              onOpenChange(false);
              setResult(next);
            }}
          />
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={result !== null}
        onOpenChange={(next) => {
          // 9.8 returns the key once and nothing reads it back, so closing lets it go.
          if (!next) setResult(null);
        }}
      >
        <DialogContent>
          {result ? (
            <StationKeyReveal kind="replace" result={result} onDone={() => setResult(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** FRO-28's confirmation, and the 9.8 call it guards. Mounted only while the alert is open. */
function ReplaceStationKeyConfirm({
  station,
  onReplaced,
}: {
  station: EventStationBoardStation;
  onReplaced: (result: StationKeyResponse) => void;
}) {
  const replaceKey = useReplaceStationKey();
  const [error, setError] = useState<string | null>(null);
  const name = station.passport?.name ?? station.label;

  async function handleConfirm() {
    setError(null);
    try {
      onReplaced(await replaceKey.mutateAsync(station.id));
    } catch (caught) {
      // 9.8 answers not_found for a station this Event Service does not have. Nothing was
      // replaced, so the alert stays open and says so in the same plain words as the create form.
      setError(describeError(caught));
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Replace {name}&apos;s key?</AlertDialogTitle>
        {/* The setup mode clears a moved reader's saved taps, but 9.8 keeps this station's
            stamps, so neither is claimed here. */}
        <AlertDialogDescription>{CONFIRMATION}</AlertDialogDescription>
      </AlertDialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={replaceKey.isPending}>Cancel</AlertDialogCancel>
        {/* Radix's AlertDialogAction is a Close, so it would shut the alert while the call
            was still in flight and a refusal would have nowhere to show. preventDefault holds
            it open until the call has answered. */}
        <AlertDialogAction
          disabled={replaceKey.isPending}
          onClick={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          {replaceKey.isPending ? "Replacing" : "Replace key"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
