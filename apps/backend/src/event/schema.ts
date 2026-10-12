import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { isoNow, isoTimestamp, stationId, tokenUid, userId } from "../db/columns.ts";

/**
 * The Event side's tables. The claims stand-in's `tokens` is in
 * src/claims-stand-in/schema.ts, and no foreign key crosses between the two.
 * Timestamps are ISO strings, not DATETIME: src/db/columns.ts says why.
 */

export const USER_ROLES = ["participant", "organizer"] as const;

export const users = mysqlTable("users", {
  id: userId("id").primaryKey(),
  portalUserId: userId("portal_user_id").unique(),
  displayName: text("display_name").notNull(),
  role: mysqlEnum("role", USER_ROLES).notNull().default("participant"),
  createdAt: isoTimestamp("created_at").notNull().$defaultFn(isoNow),
});

export const stations = mysqlTable("stations", {
  id: stationId("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  /** SHA-256 of the key, in hex. */
  apiKeyHash: varchar("api_key_hash", { length: 64 }).notNull().unique(),
  points: int("points").notNull().default(1),
  createdAt: isoTimestamp("created_at").notNull().$defaultFn(isoNow),
  lastSeenAt: isoTimestamp("last_seen_at"),
});

export const TAP_SOURCES = ["nfc", "qr_fallback"] as const;
export const STORED_TAP_STATUSES = ["accepted", "cooldown", "unknown_token"] as const;

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
    tokenUid: tokenUid("token_uid").notNull(),
    userId: userId("user_id").references(() => users.id),
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
export type Tap = typeof taps.$inferSelect;
export type NewTap = typeof taps.$inferInsert;
