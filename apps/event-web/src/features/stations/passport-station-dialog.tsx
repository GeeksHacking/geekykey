import type { EventStationBoardStation } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { returnFocusOnClose } from "@/features/stations/dialog-focus";
import { PassportStationForm } from "@/features/stations/passport-station-form";

/**
 * Wraps PassportStationForm in a dialog. The board renders one of these per station and
 * keeps it closed until the organiser asks for it, so no station holds open dialog state.
 *
 * `returnFocusTo` is the row's Actions button, which takes the keyboard back on
 * close (FRO-99, FRO-100).
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
      <DialogContent onCloseAutoFocus={(event) => returnFocusOnClose(event, returnFocusTo)}>
        <CornerBrackets />
        <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto">
          <PassportStationForm
            station={station}
            stationLabel={label}
            onSaved={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
