import type { EventStationBoardStation } from "@/api/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BoothForm } from "@/features/stations/booth-form";

/**
 * Wraps BoothForm in a dialog. The board renders one of these per station and keeps it
 * closed until the organiser asks for it, so no station holds open dialog state.
 */
export function BoothDialog({
  station,
  open,
  onOpenChange,
}: {
  station: EventStationBoardStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <BoothForm station={station} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
