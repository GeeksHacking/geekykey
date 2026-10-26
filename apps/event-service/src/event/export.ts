import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { passportStations, taps, users } from "./schema.ts";

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
  const rows = await db
    .select({
      tap_id: taps.id,
      client_tap_id: taps.clientTapId,
      station_id: taps.stationId,
      station_name: passportStations.name,
      user_id: taps.userId,
      display_name: users.displayName,
      status: taps.status,
      source: taps.source,
      tapped_at: taps.tappedAt,
      received_at: taps.receivedAt,
    })
    .from(taps)
    .leftJoin(passportStations, eq(passportStations.stationId, taps.stationId))
    .leftJoin(users, eq(users.id, taps.userId))
    .orderBy(asc(taps.id));
  const lines = [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((column) => csvCell(String(row[column] ?? ""))).join(",")),
  ];
  return lines.map((line) => `${line}\r\n`).join("");
}
