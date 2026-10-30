import type { EventStationBoardStation } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BoothForm } from "@/features/stations/booth-form";
import { returnFocusOnClose } from "@/features/stations/dialog-focus";

/**
 * Wraps BoothForm in a dialog. The board renders one of these per station and keeps it
 * closed until the organiser asks for it, so no station holds open dialog state.
 *
 * `returnFocusTo` is the row's Actions button, which takes the keyboard back on
 * close (FRO-99, FRO-100).
 */
export function BoothDialog({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={(event) => returnFocusOnClose(event, returnFocusTo)}>
        <CornerBrackets />
        <BoothForm station={station} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
