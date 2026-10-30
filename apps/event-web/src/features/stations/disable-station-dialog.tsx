import { useState } from "react";

import { describeError } from "@/api/errors";
import type { EventStationBoardStation } from "@/api/types";
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
import { returnFocusOnClose } from "@/features/stations/dialog-focus";
import { useDisableStation } from "@/features/stations/use-disable-station";

/** FRO-26's sentence, from the ticket. Used as written, so it is asserted whole. */
const CONFIRMATION =
  "Within a minute its key stops working. The station keeps the taps it saves, and they count once it's enabled again.";

/**
 * FRO-26's confirmation, in front of 9.9's disable call. Enable, the other 9.9
 * direction, has none, so this alert is the whole surface for the off switch.
 *
 * As with the replace-key alert, Radix mounts the content only once it opens, which is
 * what holds the useDisableStation call here rather than in the board's row.
 *
 * `returnFocusTo` is the row's Disable button. A successful disable replaces it with Enable,
 * so the row's new power button takes the keyboard back instead (FRO-99).
 */
export function DisableStationDialog({
  station,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  station: EventStationBoardStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: HTMLElement | null;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => returnFocusOnClose(event, returnFocusTo, station.id)}
      >
        <DisableStationConfirm station={station} onDisabled={() => onOpenChange(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** FRO-26's confirmation, and the disable call it guards. Mounted only while the alert is open. */
function DisableStationConfirm({
  station,
  onDisabled,
}: {
  station: EventStationBoardStation;
  onDisabled: () => void;
}) {
  const disable = useDisableStation();
  const [error, setError] = useState<string | null>(null);
  const name = station.passport?.name ?? station.label;

  async function handleConfirm() {
    setError(null);
    try {
      await disable.mutateAsync(station.id);
      onDisabled();
    } catch (caught) {
      // 9.9 answers not_found for a station this Event Service does not have. Nothing was
      // disabled, so the alert stays open and says so in the same plain words as the
      // replace-key alert beside it in the row.
      setError(describeError(caught));
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Disable {name}?</AlertDialogTitle>
        <AlertDialogDescription>{CONFIRMATION}</AlertDialogDescription>
      </AlertDialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={disable.isPending}>Cancel</AlertDialogCancel>
        {/* Radix's AlertDialogAction is a Close, so it would shut the alert while the call
            was still in flight and a refusal would have nowhere to show. preventDefault holds
            it open until the call has answered. */}
        <AlertDialogAction
          disabled={disable.isPending}
          onClick={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          {disable.isPending ? "Disabling" : "Disable"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
