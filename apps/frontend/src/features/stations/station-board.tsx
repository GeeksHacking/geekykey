import type { Station } from "@/api/types";
import { OnlineStatus } from "@/components/online-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/lib/format";

export function StationBoard({ stations }: { stations: Station[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Station</TableHead>
          <TableHead className="w-20 text-right">Points</TableHead>
          <TableHead className="w-40">Status</TableHead>
          <TableHead className="w-36">Last seen</TableHead>
          <TableHead className="hidden w-36 md:table-cell">Added</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stations.map((station) => (
          <TableRow key={station.id}>
            <TableCell>
              <p className="font-medium">{station.name}</p>
              <p className="text-xs text-muted-foreground">{station.location ?? "No location"}</p>
            </TableCell>
            <TableCell className="text-right font-mono">{station.points}</TableCell>
            <TableCell>
              <OnlineStatus online={station.online} lastSeenAt={station.last_seen_at} />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {station.last_seen_at ? (
                <time dateTime={station.last_seen_at} title={formatDateTime(station.last_seen_at)}>
                  {formatRelative(station.last_seen_at)}
                </time>
              ) : (
                "Never"
              )}
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
              {formatDateTime(station.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
