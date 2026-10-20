import type { StationStats } from "@/api/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount } from "@/lib/format";

/**
 * Numbers first, with a thin single-hue bar beside them for the eye. The bar
 * has no background track and never replaces the figure; the table is the
 * accessible form of this comparison.
 */
export function StationBreakdown({ stations }: { stations: StationStats[] }) {
  const max = Math.max(1, ...stations.map((station) => station.accepted_taps));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Station</TableHead>
          <TableHead className="w-1/2">Accepted taps</TableHead>
          <TableHead className="w-40 text-right">Unique participants</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stations.map((station) => (
          <TableRow key={station.station_id}>
            <TableCell className="font-medium">{station.name}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-right font-mono">
                  {formatCount(station.accepted_taps)}
                </span>
                <div className="h-1.5 flex-1">
                  <div
                    className="h-full rounded-r bg-primary ring-1 ring-inset ring-primary-edge"
                    style={{ width: `${(station.accepted_taps / max) * 100}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCount(station.unique_participants)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
