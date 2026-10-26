import { asc } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { taps } from "./schema.ts";
import { type LoggedTap, selectLoggedTaps } from "./tap-log.ts";

/** The export's columns, in the API agreement's order (9.6). */
const COLUMNS = [
  "tap_id",
  "client_tap_id",
  "station_id",
  "station_name",
  "user_id",
  "display_name",
  "status",
  "source",
  "tapped_at",
  "received_at",
] as const;

/**
 * One CSV cell, as RFC 4180 writes it: a value with a comma, a quote or a line
 * break goes in quotes, with each quote doubled. Names are whatever a user or
 * an organizer typed, so any of them can turn up. A name a spreadsheet could
 * run as a formula is left as it is: the Event screens escape it, and say so
 * (the API agreement's section 13).
 */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Every stored tap as CSV, oldest first by ID, for the A/B analysis (the API
 * agreement's 9.6). No token ID: the Event side never sees one. A missing
 * value, such as a station outside the passport's name, is an empty cell.
 * Every line ends in CRLF, as RFC 4180 has it.
 */
export async function exportTapsCsv(db: Db): Promise<string> {
  const rows = await selectLoggedTaps(db).orderBy(asc(taps.id));
  const lines = [COLUMNS.join(","), ...rows.map((tap) => csvRow(tap).map(csvCell).join(","))];
  return lines.map((line) => `${line}\r\n`).join("");
}

/** A tap's cells, in COLUMNS' order. */
function csvRow(tap: LoggedTap): string[] {
  return [
    String(tap.id),
    tap.clientTapId,
    tap.stationId,
    tap.stationName ?? "",
    tap.userId,
    tap.displayName ?? "",
    tap.status,
    tap.source,
    tap.tappedAt ?? "",
    tap.receivedAt,
  ];
}
