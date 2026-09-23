import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";

import type { AdminTap } from "@/api/types";
import { TapStatusLabel } from "@/components/tap-status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatTimeWithSeconds, formatUid } from "@/lib/format";

/*
  TanStack Table 9. Features are opt-in; the scan log only needs the core row
  model, so the feature set is empty. Row, cell, and header methods live on
  prototypes in v9: call them on the instance, never spread or destructure one.
*/
const features = tableFeatures({});
const column = createColumnHelper<typeof features, AdminTap>();

const columns = column.columns([
  column.display({
    id: "time",
    header: "Time",
    cell: ({ row }) => (
      <time
        dateTime={row.original.received_at}
        title={formatDateTime(row.original.received_at)}
        className="font-mono text-xs"
      >
        {formatTimeWithSeconds(row.original.received_at)}
      </time>
    ),
  }),
  column.display({
    id: "station",
    header: "Station",
    cell: ({ row }) => <span className="font-medium">{row.original.station.name}</span>,
  }),
  column.display({
    id: "participant",
    header: "Participant",
    cell: ({ row }) =>
      row.original.user ? (
        row.original.user.display_name
      ) : (
        <span className="text-muted-foreground">Unknown token</span>
      ),
  }),
  column.display({
    id: "token",
    header: "Token",
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-xs">
        {row.original.token_uid ? formatUid(row.original.token_uid) : "None"}
      </span>
    ),
  }),
  column.display({
    id: "status",
    header: "Status",
    cell: ({ row }) => <TapStatusLabel status={row.original.status} />,
  }),
  column.display({
    id: "source",
    header: "Source",
    cell: ({ row }) => (
      <Badge variant="muted">
        {row.original.source === "qr_fallback" ? "Organiser" : "Station"}
      </Badge>
    ),
  }),
]);

export function ScanLogTable({ taps }: { taps: AdminTap[] }) {
  const table = useTable({
    features,
    columns,
    data: taps,
    getRowId: (row) => String(row.id),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
