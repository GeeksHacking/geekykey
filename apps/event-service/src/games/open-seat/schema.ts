import { index, int, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { connectionRequestId, isoTimestamp, stationId, userId } from "../../db/columns.ts";

/** The open seat's records (BAC-190, the API agreement's section 4, "Open seat"). */

/** One row, locked by every open seat tap, so one seat is open at a time across the event. */
export const openSeatLock = mysqlTable("open_seat_lock", {
  id: int("id").primaryKey(),
});

/**
 * Each seat opened, taken or not, so the report can count seats opened, taken and accepted. A
 * seat is open until `closesAt` while nobody has taken it, with no worker to close it.
 */
export const openSeats = mysqlTable(
  "open_seats",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    stationId: stationId("station_id").notNull(),
    /** Who opened it. */
    sitterId: userId("sitter_id").notNull(),
    openedAt: isoTimestamp("opened_at").notNull(),
    closesAt: isoTimestamp("closes_at").notNull(),
    /** Who took it, or null while nobody has. */
    takerId: userId("taker_id"),
    takenAt: isoTimestamp("taken_at"),
    /** The prompt the station showed the two, one string per screen line, once taken. */
    prompt: json("prompt").$type<string[]>(),
    /**
     * The connection request taking it sent the sitter, or null for none, as when the two were
     * already connected by a request of the sitter's that waited for the taker.
     */
    requestId: connectionRequestId("request_id"),
    /** When the two connected through it, or null until then. */
    acceptedAt: isoTimestamp("accepted_at"),
  },
  (t) => [
    index("open_seats_opened_at_idx").on(t.openedAt),
    // /me reads a user's latest seat from either side.
    index("open_seats_sitter_idx").on(t.sitterId),
    index("open_seats_taker_idx").on(t.takerId),
    // An accept finds its seat by the request.
    index("open_seats_request_idx").on(t.requestId),
  ],
);
