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

export function StationBoard({ stations }: { stations: EventStationBoardStation[] }) {
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
        {stations.map((station) => (
          <TableRow key={station.id}>
            <TableCell>
              <p className="font-medium">
                {station.passport?.name ?? station.label ?? "Unnamed station"}
              </p>
              <p className="text-xs text-muted-foreground">
                {station.passport
                  ? (station.passport.location ?? "No location")
                  : "Not in the passport"}
              </p>
              {station.linked === false ? (
                <p className="mt-1 text-xs font-medium text-status-unknown">No longer linked</p>
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
        ))}
      </TableBody>
    </Table>
  );
}
