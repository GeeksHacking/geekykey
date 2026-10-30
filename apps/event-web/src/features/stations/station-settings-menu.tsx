import { CaretDown, GearSix } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { describeError } from "@/api/errors";
import type { EventStationBoardStation } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEnableStation } from "@/features/stations/use-enable-station";

/** Each opens one of the row's dialogs, which hand the keyboard back to `opener` on close. */
type OpenDialog = (opener: HTMLElement) => void;

/**
 * FRO-100. A row's one control, holding every action that used to sit under the station's
 * name, with the same wording. Each item opens the dialog it opened before, except Enable,
 * which acts at once because FRO-26 gives it no confirmation.
 *
 * The trigger is every dialog's opener. It stays in the row whatever a save changes, so
 * the keyboard comes back to it even after Disable has turned into Enable (FRO-99).
 */
export function StationSettingsMenu({
  station,
  onPassport,
  onBooth,
  onReplaceKey,
  onDisable,
}: {
  station: EventStationBoardStation;
  onPassport: OpenDialog;
  onBooth: OpenDialog;
  onReplaceKey: OpenDialog;
  onDisable: OpenDialog;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const enable = useEnableStation();
  const [error, setError] = useState<string | null>(null);
  const name = station.passport?.name ?? station.label;

  function openDialog(openFor: OpenDialog) {
    if (trigger.current) openFor(trigger.current);
  }

  async function handleEnable() {
    setError(null);
    try {
      await enable.mutateAsync(station.id);
    } catch (caught) {
      // 9.9 answers not_found for a station this Event Service does not have. Nothing was
      // enabled, and there is no dialog to hold the message, so the row says so.
      setError(describeError(caught));
    }
  }

  return (
    <div className="grid justify-items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Station settings for ${name}`}
          >
            <GearSix aria-hidden />
            {/* The organiser screens must still work at 768 px, where the station's name
                needs the room more. The aria-label names it at every width. */}
            <span className="hidden lg:inline">Station settings</span>
            <CaretDown aria-hidden className="hidden lg:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* Agreement 9.1. A station with no settings can be added; one with settings changed. */}
          <DropdownMenuItem onSelect={() => openDialog(onPassport)}>
            {station.passport ? "Edit passport settings" : "Add to passport"}
          </DropdownMenuItem>
          {/* Agreement 9.12. On every station, disabled ones included, because the map
              draws a station at its booth whatever game it runs and however many taps it has. */}
          <DropdownMenuItem onSelect={() => openDialog(onBooth)}>
            {station.booth ? "Change booth" : "Set booth"}
          </DropdownMenuItem>
          {/* FRO-28, on 9.8. On every station too: spec section 10 has an organiser disable
              a station that has gone missing and then replace its key. */}
          <DropdownMenuItem onSelect={() => openDialog(onReplaceKey)}>Replace key</DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* FRO-26, on 9.9. One switch by the station's state: Disable asks first, in its
              alert, and Enable acts at once. */}
          {station.disabled_at === null ? (
            <DropdownMenuItem onSelect={() => openDialog(onDisable)}>Disable</DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={enable.isPending} onSelect={() => void handleEnable()}>
              {enable.isPending ? "Enabling" : "Enable"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Picking Enable closes the menu, so the row says the call is still running. */}
      {enable.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Enabling
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
