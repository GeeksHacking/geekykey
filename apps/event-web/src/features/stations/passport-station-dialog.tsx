import type { EventStationBoardStation } from "@/api/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PassportStationForm } from "@/features/stations/passport-station-form";

/**
 * Wraps PassportStationForm in a dialog. The board renders one of these per station and
 * keeps it closed until the organiser asks for it, so no station holds open dialog state.
 */
export function PassportStationDialog({
  station,
  open,
  onOpenChange,
}: {
  station: EventStationBoardStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const label = station.passport?.name ?? station.label ?? "this station";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <PassportStationForm
          station={station}
          stationLabel={label}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
