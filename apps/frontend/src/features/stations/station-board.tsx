import { WarningCircle } from "@phosphor-icons/react";

import type { EventStationBoardStation } from "@/api/types";
import { OnlineStatus } from "@/components/online-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatWhen } from "@/lib/format";

import {
  hasStationProblem,
  sortStationsByTrouble,
  stationProblems,
  STATION_PROBLEMS,
} from "./station-problems";

export function StationBoard({ stations }: { stations: EventStationBoardStation[] }) {
  // Trouble first, so whoever is at the desk sees the rows that need them (agreement 9.2).
  const sorted = sortStationsByTrouble(stations);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Station</TableHead>
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
              className={hasStationProblem(station) ? "bg-destructive/5" : undefined}
            >
              <TableCell>
                <p className="font-medium">
                  {station.passport?.name ?? station.label ?? "Unnamed station"}
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
                {station.linked === false ? (
                  <p className="mt-1 text-xs font-medium text-status-unknown">No longer linked</p>
                ) : null}
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
              <TableCell className="text-right font-mono">
                {station.passport?.points ?? "—"}
              </TableCell>
              <TableCell>
                <OnlineStatus online={station.online ?? false} lastSeenAt={station.last_seen_at} />
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
