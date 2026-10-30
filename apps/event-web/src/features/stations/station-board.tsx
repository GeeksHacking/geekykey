import { WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

import { describeError } from "@/api/errors";
import type { EventStationBoardStation } from "@/api/types";
import { OnlineStatus } from "@/components/online-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEnableStation } from "@/features/stations/use-enable-station";
import { EMPTY_CELL, formatDateTime, formatWhen } from "@/lib/format";

import { BoothDialog } from "./booth-dialog";
import { DisableStationDialog } from "./disable-station-dialog";
import { PassportStationDialog } from "./passport-station-dialog";
import { ReplaceStationKeyDialog } from "./replace-station-key-dialog";
import { useStationDialog } from "./use-station-dialog";
import {
  hasStationProblem,
  sortStationsByTrouble,
  stationProblems,
  STATION_PROBLEMS,
} from "./station-problems";

export function StationBoard({ stations }: { stations: EventStationBoardStation[] }) {
  // Trouble first, so whoever is at the desk sees the rows that need them (agreement 9.2).
  const sorted = sortStationsByTrouble(stations);
  const passport = useStationDialog();
  const booth = useStationDialog();
  const replaceKey = useStationDialog();
  const disableDialog = useStationDialog();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Station</TableHead>
          <TableHead className="w-24">Booth</TableHead>
          <TableHead className="w-20 text-right">Points</TableHead>
          <TableHead className="w-40">Status</TableHead>
          <TableHead className="w-40">Last tap here</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((station) => {
          const problems = stationProblems(station);
          // "Not in the passport" is already the subtitle line below, so it is not
          // repeated here. Every problem is still named in words, never colour alone.
          const listed = problems.filter((problem) => problem !== "notInPassport");

          return (
            <TableRow
              key={station.id}
              data-station-id={station.id}
              className={hasStationProblem(station) ? "bg-destructive/5" : undefined}
            >
              <TableCell>
                <p className="font-medium">
                  {station.passport?.name ?? station.label}
                  {station.disabled_at !== null ? (
                    <Badge variant="muted" className="ml-2 align-middle">
                      Disabled
                    </Badge>
                  ) : null}
                </p>
                <p
                  className={
                    station.passport
                      ? "text-xs text-muted-foreground"
                      : "text-xs font-medium text-destructive"
                  }
                >
                  {station.passport
                    ? (station.passport.location ?? "No location")
                    : "Not in the passport"}
                </p>
                {listed.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {listed.map((problem) => (
                      <li
                        key={problem}
                        className="flex items-center gap-1 text-xs font-medium text-destructive"
                      >
                        <WarningCircle weight="fill" className="h-3 w-3 shrink-0" aria-hidden />
                        {STATION_PROBLEMS[problem]}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <PassportButton
                    station={station}
                    onOpen={(opener) => passport.openFor(station.id, opener)}
                    editing={station.passport !== null}
                  />
                  {/* Agreement 9.12. On every row, disabled stations included, because the
                      map draws a station at its booth whatever game it runs and however many
                      taps it has. */}
                  <BoothButton
                    station={station}
                    onOpen={(opener) => booth.openFor(station.id, opener)}
                    editing={station.booth !== null}
                  />
                  {/* FRO-28 says each station has this, with no word about enabled ones, and
                      spec section 10 has an organizer disable a station that has gone missing
                      and then replace its key. So it is on every row, disabled included. */}
                  <ReplaceKeyButton
                    station={station}
                    onOpen={(opener) => replaceKey.openFor(station.id, opener)}
                  />
                  {/* FRO-26. One switch per row, by its state: an enabled station has
                      Disable, whose ask lives behind the confirmation alert; a disabled one
                      has Enable, which acts at once because the ticket gives it none. */}
                  {station.disabled_at === null ? (
                    <DisableStationButton
                      station={station}
                      onOpen={(opener) => disableDialog.openFor(station.id, opener)}
                    />
                  ) : (
                    <EnableStationButton station={station} />
                  )}
                </div>
                <PassportStationDialog
                  station={station}
                  open={passport.isOpenFor(station.id)}
                  returnFocusTo={passport.opener}
                  onOpenChange={(open) => {
                    if (!open) passport.close();
                  }}
                />
                <BoothDialog
                  station={station}
                  open={booth.isOpenFor(station.id)}
                  returnFocusTo={booth.opener}
                  onOpenChange={(open) => {
                    if (!open) booth.close();
                  }}
                />
                <ReplaceStationKeyDialog
                  station={station}
                  open={replaceKey.isOpenFor(station.id)}
                  returnFocusTo={replaceKey.opener}
                  onOpenChange={(open) => {
                    if (!open) replaceKey.close();
                  }}
                />
                <DisableStationDialog
                  station={station}
                  open={disableDialog.isOpenFor(station.id)}
                  returnFocusTo={disableDialog.opener}
                  onOpenChange={(open) => {
                    if (!open) disableDialog.close();
                  }}
                />
              </TableCell>
              <TableCell className="w-24 break-words">
                {station.booth ? (
                  <span className="font-mono text-xs">{station.booth}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">No booth</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {station.passport?.points ?? EMPTY_CELL}
              </TableCell>
              <TableCell>
                <OnlineStatus online={station.online} lastSeenAt={station.last_seen_at} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {station.last_tap_at ? (
                  <time dateTime={station.last_tap_at} title={formatDateTime(station.last_tap_at)}>
                    {formatWhen(station.last_tap_at)}
                  </time>
                ) : (
                  "Never"
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Agreement 9.1. A station with no settings can be added; one with settings can be changed. */
function PassportButton({
  station,
  editing,
  onOpen,
}: {
  station: EventStationBoardStation;
  editing: boolean;
  onOpen: (opener: HTMLElement) => void;
}) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0 text-xs"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`${editing ? "Change passport settings for" : "Add to passport"} ${
        station.passport?.name ?? station.label
      }`}
    >
      {editing ? "Edit passport settings" : "Add to passport"}
    </Button>
  );
}

/** Agreement 9.12. The booth action, named for its row like the passport and key ones. */
function BoothButton({
  station,
  editing,
  onOpen,
}: {
  station: EventStationBoardStation;
  editing: boolean;
  onOpen: (opener: HTMLElement) => void;
}) {
  const name = station.passport?.name ?? station.label;

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0 text-xs"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`${editing ? "Change" : "Set"} booth for ${name}`}
    >
      {editing ? "Change booth" : "Set booth"}
    </Button>
  );
}

/** FRO-28, on 9.8. The link style and the named aria-label match PassportButton above. */
function ReplaceKeyButton({
  station,
  onOpen,
}: {
  station: EventStationBoardStation;
  onOpen: (opener: HTMLElement) => void;
}) {
  const name = station.passport?.name ?? station.label;

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0 text-xs"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`Replace key for ${name}`}
    >
      Replace key
    </Button>
  );
}

/**
 * FRO-26, on 9.9. The row's off switch. The ask is elsewhere: this only opens the alert,
 * which holds the disable call. The default variant is the ticket's decision; the smaller
 * size keeps it inside the row the link buttons above set.
 */
function DisableStationButton({
  station,
  onOpen,
}: {
  station: EventStationBoardStation;
  onOpen: (opener: HTMLElement) => void;
}) {
  const name = station.passport?.name ?? station.label;

  return (
    <Button
      type="button"
      size="sm"
      data-station-power
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`Disable ${name}`}
    >
      Disable
    </Button>
  );
}

/**
 * FRO-26, on 9.9. The row's on switch. Enabling needs no confirmation (the ticket), so
 * this one acts at once, and a 9.9 refusal says so in the row itself, since there is no
 * dialog to hold the message.
 */
function EnableStationButton({ station }: { station: EventStationBoardStation }) {
  const enable = useEnableStation();
  const [error, setError] = useState<string | null>(null);
  const name = station.passport?.name ?? station.label;

  async function handleEnable() {
    setError(null);
    try {
      await enable.mutateAsync(station.id);
    } catch (caught) {
      // 9.9 answers not_found for a station this Event Service does not have. Nothing was
      // enabled, so the row says so and the button comes back with it.
      setError(describeError(caught));
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        data-station-power
        onClick={() => void handleEnable()}
        disabled={enable.isPending}
        aria-label={`Enable ${name}`}
      >
        {enable.isPending ? "Enabling" : "Enable"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
