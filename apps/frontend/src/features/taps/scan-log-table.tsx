import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";

import type { AdminTap } from "@/api/types";
import { TapStatusLabel } from "@/components/tap-status";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatTimeWithSeconds, formatUid } from "@/lib/format";

const columns: ColumnDef<AdminTap>[] = [
  {
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
  },
  {
    id: "station",
    header: "Station",
    cell: ({ row }) => <span className="font-medium">{row.original.station.name}</span>,
  },
  {
    id: "participant",
    header: "Participant",
    cell: ({ row }) =>
      row.original.user ? (
        row.original.user.display_name
      ) : (
        <span className="text-muted-foreground">Unknown token</span>
      ),
  },
  {
    id: "token",
    header: "Token",
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-xs">
        {row.original.token_uid ? formatUid(row.original.token_uid) : "None"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <TapStatusLabel status={row.original.status} />,
  },
  {
    id: "source",
    header: "Source",
    cell: ({ row }) => (
      <Badge variant="muted">{row.original.source === "qr_fallback" ? "Organiser" : "Station"}</Badge>
    ),
  },
];

export function ScanLogTable({ taps }: { taps: AdminTap[] }) {
  // The React Compiler cannot memoise TanStack Table's instance. We do not run the compiler, so this is only informational.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: taps,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
