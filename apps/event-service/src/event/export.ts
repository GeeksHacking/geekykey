import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { groupMembers, participantGroups, taps, users } from "./schema.ts";
import { type LoggedTap, selectLoggedTaps } from "./tap-log.ts";

/** The tap export's columns, in the API agreement's order (9.6). */
const TAP_COLUMNS = [
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

/** The groups export's columns (draft for the API agreement's 0.14). */
const GROUP_COLUMNS = [
  "user_id",
  "display_name",
  "group_name",
  "joined_at",
  "placed_at",
  "how",
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

/** A CSV file: the column names, then the rows. Every line ends in CRLF, as RFC 4180 has it. */
function csvFile(columns: readonly string[], rows: string[][]): string {
  const lines = [columns.join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return lines.map((line) => `${line}\r\n`).join("");
}

/**
 * Every stored tap as CSV, oldest first by ID (the API agreement's 9.6).
 * No token ID: the Event side never sees one. A missing value, such as the
 * name of a station that isn't a stamp slot, is an empty cell.
 */
export async function exportTapsCsv(db: Db): Promise<string> {
  const rows = await selectLoggedTaps(db).orderBy(asc(taps.id));
  return csvFile(TAP_COLUMNS, rows.map(tapRow));
}

/** A tap's cells, in TAP_COLUMNS' order. */
function tapRow(tap: LoggedTap): string[] {
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

/**
 * Everyone who has joined the groups as CSV, oldest join first, for the report's
 * time to group (draft for the API agreement's 0.14). Someone still waiting has
 * an empty group, placed time and how.
 */
export async function exportGroupsCsv(db: Db): Promise<string> {
  const members = await db
    .select({
      userId: groupMembers.userId,
      displayName: users.displayName,
      groupName: participantGroups.name,
      joinedAt: groupMembers.joinedAt,
      placedAt: groupMembers.placedAt,
      how: groupMembers.how,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .leftJoin(participantGroups, eq(participantGroups.id, groupMembers.groupId))
    .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId));
  return csvFile(
    GROUP_COLUMNS,
    members.map((member) => [
      member.userId,
      member.displayName,
      member.groupName ?? "",
      member.joinedAt,
      member.placedAt ?? "",
      member.how ?? "",
    ]),
  );
}
