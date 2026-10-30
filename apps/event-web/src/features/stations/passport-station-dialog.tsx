import type { EventStationBoardStation } from "@/api/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { returnFocusOnClose } from "@/features/stations/dialog-focus";
import { PassportStationForm } from "@/features/stations/passport-station-form";

/**
 * Wraps PassportStationForm in a dialog. The board renders one of these per station and
 * keeps it closed until the organiser asks for it, so no station holds open dialog state.
 *
 * `returnFocusTo` is the row's passport button, which takes the keyboard back on close
 * (FRO-99).
 */
export function PassportStationDialog({
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
  const label = station.passport?.name ?? station.label ?? "this station";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => returnFocusOnClose(event, returnFocusTo, station.id)}
      >
        <PassportStationForm
          station={station}
          stationLabel={label}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
