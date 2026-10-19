import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { isoNow, isoTimestamp, stationId, userId } from "../db/columns.ts";

/**
 * The Event side's tables. The claims stand-in's `tokens` is in
 * src/claims-stand-in/schema.ts, and no foreign key crosses between the two.
 * Timestamps are ISO strings, not DATETIME: src/db/columns.ts says why.
 */

/**
 * The users who have logged in to this Event Service, by their user ID. Who
 * is an organizer comes from the ORGANIZERS setting, not from here.
 */
export const users = mysqlTable("users", {
  id: userId("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: isoTimestamp("created_at").notNull().$defaultFn(isoNow),
});

export const stations = mysqlTable("stations", {
  id: stationId("id").primaryKey(),
  /** The device's name, such as "Reader 3". Its name in the passport is passport_stations.name. */
  label: text("label").notNull(),
  /** SHA-256 of the key, in hex. */
  apiKeyHash: varchar("api_key_hash", { length: 64 }).notNull().unique(),
  /**
   * When an organizer disabled the station, or null while it's enabled. A
   * disabled station drops off the registered stations, so the GeekyKey
   * Service refuses its key.
   */
  disabledAt: isoTimestamp("disabled_at"),
  createdAt: isoTimestamp("created_at").notNull().$defaultFn(isoNow),
  /** When a hand-off or a heartbeat last came from the station, for its online light. */
  lastSeenAt: isoTimestamp("last_seen_at"),
  /** The rest of what the station's last heartbeat said, null until one says it. */
  firmwareVersion: varchar("firmware_version", { length: 64 }),
  /** Taps saved on the station and not yet sent. */
  bufferedTaps: int("buffered_taps"),
  /** False when the NFC reader didn't answer the station's own check. */
  readerOk: boolean("reader_ok"),
});

/**
 * The passport's settings for each station it counts. Only these stations are
 * stamp slots, oldest settings first; a tap at any other station is `no_game`.
 */
export const passportStations = mysqlTable("passport_stations", {
  stationId: stationId("station_id")
    .primaryKey()
    .references(() => stations.id),
  /** The station's name in the passport, such as "3D Printing Booth". */
  name: text("name").notNull(),
  location: text("location"),
  /** Station points: what one accepted tap there is worth. */
  points: int("points").notNull().default(1),
  /** When the station was added to the passport, which orders the stamp slots. */
  addedAt: isoTimestamp("added_at").notNull().$defaultFn(isoNow),
});

export const TAP_SOURCES = ["nfc", "qr_fallback"] as const;
/** `duplicate` and the GeekyKey Service's `unknown_token` are answered, never stored. */
export const STORED_TAP_STATUSES = ["accepted", "cooldown", "no_game"] as const;

/**
 * The migration adds `AUTO_ID_CACHE=1` to this table by hand, since Drizzle
 * can't declare it, so a newer tap always has a higher `id`.
 */
export const taps = mysqlTable(
  "taps",
  {
    id: int("id").autoincrement().primaryKey(),
    stationId: stationId("station_id")
      .notNull()
      .references(() => stations.id),
    /** Station-generated ID that makes retries idempotent. Unique per station. */
    clientTapId: varchar("client_tap_id", { length: 128 }).notNull(),
    /**
     * The tap's user, with no foreign key, so a tap by someone who has never
     * logged in to this Event Service is still stored. The Event side never
     * sees a token.
     */
    userId: userId("user_id").notNull(),
    source: mysqlEnum("source", TAP_SOURCES).notNull().default("nfc"),
    status: mysqlEnum("status", STORED_TAP_STATUSES).notNull(),
    /** Device clock time of the tap. Nullable because ESP32 clocks are unreliable. */
    tappedAt: isoTimestamp("tapped_at"),
    receivedAt: isoTimestamp("received_at").notNull(),
  },
  (t) => [
    uniqueIndex("taps_station_client_tap_id_uidx").on(t.stationId, t.clientTapId),
    index("taps_station_user_status_idx").on(t.stationId, t.userId, t.status),
    index("taps_received_at_idx").on(t.receivedAt),
    // GET /api/v1/me reads one participant's taps on every poll.
    index("taps_user_received_at_idx").on(t.userId, t.receivedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type PassportStation = typeof passportStations.$inferSelect;
export type Tap = typeof taps.$inferSelect;
export type NewTap = typeof taps.$inferInsert;
