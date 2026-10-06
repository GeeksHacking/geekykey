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
import { formatDateTime, formatTimeWithSeconds } from "@/lib/format";

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
        <span className="sm:hidden">{formatDateTime(row.original.received_at)}</span>
        <span className="hidden sm:inline">{formatTimeWithSeconds(row.original.received_at)}</span>
      </time>
    ),
  }),
  column.display({
    id: "station",
    header: "Station",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.station.name ?? "Not in the passport"}</span>
    ),
  }),
  column.display({
    id: "participant",
    header: "Participant",
    // The user ID is always shown next to the name: a name can be missing, but
    // the ID is what identifies who was tapped.
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{row.original.user.display_name ?? "Never logged in"}</span>
        <code className="font-mono text-xs text-muted-foreground">{row.original.user.id}</code>
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
