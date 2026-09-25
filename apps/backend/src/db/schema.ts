import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** ISO 8601 UTC with milliseconds, matching `Date.prototype.toISOString()`. */
const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const USER_ROLES = ["participant", "organizer"] as const;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    portalUserId: text("portal_user_id").unique(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("participant"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (
    t,
  ) => [
    check("users_role_check", sql`${t.role} IN ('participant', 'organizer')`),
  ],
);

export const tokens = sqliteTable(
  "tokens",
  {
    uid: text("uid").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    pairedAt: text("paired_at").notNull().default(isoNow),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("tokens_user_id_idx").on(t.userId)],
);

export const stations = sqliteTable("stations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  points: integer("points").notNull().default(1),
  createdAt: text("created_at").notNull().default(isoNow),
  lastSeenAt: text("last_seen_at"),
});

export const TAP_SOURCES = ["nfc", "qr_fallback"] as const;
export const STORED_TAP_STATUSES = [
  "accepted",
  "cooldown",
  "unknown_token",
] as const;

export const taps = sqliteTable(
  "taps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stationId: text("station_id").notNull().references(() => stations.id),
    /** Station-generated ID that makes retries idempotent. Unique per station. */
    clientTapId: text("client_tap_id").notNull(),
    tokenUid: text("token_uid").notNull(),
    userId: text("user_id").references(() => users.id),
    source: text("source", { enum: TAP_SOURCES }).notNull().default("nfc"),
    status: text("status", { enum: STORED_TAP_STATUSES }).notNull(),
    /** Device clock time of the tap. Nullable because ESP32 clocks are unreliable. */
    tappedAt: text("tapped_at"),
    receivedAt: text("received_at").notNull(),
  },
  (t) => [
    uniqueIndex("taps_station_client_tap_id_uidx").on(
      t.stationId,
      t.clientTapId,
    ),
    index("taps_station_user_status_idx").on(t.stationId, t.userId, t.status),
    index("taps_received_at_idx").on(t.receivedAt),
    // GET /api/v1/me reads one participant's taps on every poll.
    index("taps_user_received_at_idx").on(t.userId, t.receivedAt),
    check("taps_source_check", sql`${t.source} IN ('nfc', 'qr_fallback')`),
    check(
      "taps_status_check",
      sql`${t.status} IN ('accepted', 'cooldown', 'unknown_token')`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type Tap = typeof taps.$inferSelect;
export type NewTap = typeof taps.$inferInsert;
