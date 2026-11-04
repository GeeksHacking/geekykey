import { TOKEN_KIND_MAX } from "@geekykey/handoff";
import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { groupId, isoNow, isoTimestamp, stationId, userId } from "../db/columns.ts";

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
  /** The name the event shows: the login's, `Guest` when a login had none, or one the user set. */
  displayName: text("display_name").notNull(),
  /**
   * When the user last set their name (PATCH /api/v1/me), or null while it
   * comes from their login. Once set, a login no longer changes it.
   */
  nameSetAt: isoTimestamp("name_set_at"),
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
  /**
   * The game an organizer chose for the station, by the game's ID (the API
   * agreement's 9.11), or null for none. 9.11 takes only the event's games,
   * and an ID no game of the event's has means none runs there, as after a
   * deploy that drops a game. Fixed once the station has a tap a game counted
   * or held back.
   */
  game: varchar("game", { length: 64 }),
  /**
   * Which booth in the hall the station stands at, whatever game it runs, so
   * the map draws it there (the API agreement's 9.12). Free text, which the
   * map screen matches to a booth in its own floor plan. Null for none.
   */
  booth: text("booth"),
});

/**
 * The passport's ID, which a station's `game` names when the station runs it.
 * The passport's tables are still the base's (passport_stations here, and the
 * reads in me.ts, stats.ts, map.ts and tap-log.ts), so the base knows its ID
 * with them, and no other game's.
 */
export const PASSPORT_GAME_ID = "passport";

/**
 * The passport's settings for each station it has had. Only those of these
 * stations that run the passport (`stations.game`) are stamp slots, oldest
 * settings first. A tap at any other station isn't the passport's.
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
  /**
   * The group's page, an https: URL that /me gives with the station's stamp,
   * so the passport can offer it after a new stamp. Null for none.
   */
  link: text("link"),
  /** When the station was added to the passport, which orders the stamp slots. */
  addedAt: isoTimestamp("added_at").notNull().$defaultFn(isoNow),
});

export const TAP_SOURCES = ["nfc", "qr_fallback"] as const;
/** `duplicate` and the GeekyKey Service's `unknown_token` are answered, never stored. */
export const STORED_TAP_STATUSES = ["accepted", "cooldown", "no_game"] as const;
/**
 * The statuses of a tap a game judged, counting it or holding it back. One
 * fixes its station's game (9.11), and the map counts them (9.10).
 */
export const COUNTED_TAP_STATUSES = ["accepted", "cooldown"] as const;

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

/**
 * The login links already used (POST /auth/login-link), by their `jti`, so
 * each logs someone in once. A row is kept until a minute after its link
 * expires, which is 60 seconds after the GeekyKey Service made it, and goes
 * at a later login link's use (used-login-links.ts says why the minute).
 */
export const usedLoginLinks = mysqlTable(
  "used_login_links",
  {
    /** 16 random bytes as 32 lower-case hex characters (the API agreement's 11.9). */
    jti: varchar("jti", { length: 32 }).primaryKey(),
    /** The link's `exp`, after which it's refused anyway, so its row can go. */
    expiresAt: isoTimestamp("expires_at").notNull(),
  },
  (t) => [index("used_login_links_expires_at_idx").on(t.expiresAt)],
);

/**
 * Each user's kind (ADR 0006), as the GeekyKey Service gave it: in a tap's
 * hand-off or in a login link, from the kind of their token. The first kind
 * seen stays, so a user holding tokens of two kinds keeps the one they came
 * with. Apart from `users`, since a tap's user may never have logged in here.
 * The event's own data, cleared with its users.
 */
export const userKinds = mysqlTable("user_kinds", {
  userId: userId("user_id").primaryKey(),
  kind: varchar("kind", { length: TOKEN_KIND_MAX }).notNull(),
  /** When the kind was first seen. */
  createdAt: isoTimestamp("created_at").notNull().$defaultFn(isoNow),
});

/**
 * The groups organizers make (spec: participant groups). Not `groups`, which
 * MySQL reserves. The event's settings, which the evening-before clear keeps.
 */
export const participantGroups = mysqlTable("participant_groups", {
  id: groupId("id").primaryKey(),
  /**
   * Unique, so participants can't confuse two groups, and groups.ts also refuses one that
   * differs only in capitals. At most 80 code points, as `varchar` counts.
   */
  name: varchar("name", { length: 80 }).notNull().unique(),
  /** Free text that labels the group. Allocation ignores it. */
  tags: json("tags").$type<string[]>().notNull(),
  location: text("location"),
  /** The most people the group has room for, or null for any number. */
  capacity: int("capacity"),
  /** Which group goes first when two have as many members. */
  createdAt: isoTimestamp("created_at").notNull(),
});

export const GROUP_PLACED_HOW = ["allocated", "latecomer", "organizer"] as const;

/**
 * Each participant who has joined, one row each, so nobody can be in two
 * groups. The event's own data, which the evening-before clear empties.
 */
export const groupMembers = mysqlTable(
  "group_members",
  {
    userId: userId("user_id").primaryKey(),
    /** Their group, or null while they wait. */
    groupId: groupId("group_id"),
    joinedAt: isoTimestamp("joined_at").notNull(),
    placedAt: isoTimestamp("placed_at"),
    how: mysqlEnum("how", GROUP_PLACED_HOW),
  },
  // Each participant's poll reads their group's members.
  (t) => [index("group_members_group_id_idx").on(t.groupId)],
);

/**
 * One row, made by the first write that needs it, since the evening-before
 * clear empties this table. Every write that changes who is in a group locks
 * it first, so those writes take turns across the service's instances
 * (groups.ts).
 */
export const groupAllocation = mysqlTable("group_allocation", {
  id: int("id").primaryKey(),
  /** When an organizer first pressed Allocate, or null before that. */
  startedAt: isoTimestamp("started_at"),
});

export type User = typeof users.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type PassportStation = typeof passportStations.$inferSelect;
export type Tap = typeof taps.$inferSelect;
export type NewTap = typeof taps.$inferInsert;
