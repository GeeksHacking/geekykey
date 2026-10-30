import { WarningCircle } from "@phosphor-icons/react";

import type { EventStationBoardStation } from "@/api/types";
import { OnlineStatus } from "@/components/online-status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EMPTY_CELL, formatDateTime, formatWhen } from "@/lib/format";

import { BoothDialog } from "./booth-dialog";
import { DisableStationDialog } from "./disable-station-dialog";
import { PassportStationDialog } from "./passport-station-dialog";
import { ReplaceStationKeyDialog } from "./replace-station-key-dialog";
import { StationSettingsMenu } from "./station-settings-menu";
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
          <TableHead>
            <span className="sr-only">Station settings</span>
          </TableHead>
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
              <TableCell className="text-right">
                <StationSettingsMenu
                  station={station}
                  onPassport={(opener) => passport.openFor(station.id, opener)}
                  onBooth={(opener) => booth.openFor(station.id, opener)}
                  onReplaceKey={(opener) => replaceKey.openFor(station.id, opener)}
                  onDisable={(opener) => disableDialog.openFor(station.id, opener)}
                />
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
