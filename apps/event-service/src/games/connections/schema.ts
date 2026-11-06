import { TOKEN_KIND_MAX } from "@geekykey/handoff";
import {
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { connectionId, connectionRequestId, isoTimestamp, userId } from "../../db/columns.ts";

/**
 * The connections game's tables (spec section 6, "The answers game"). The
 * event's own data, which the evening-before clear empties
 * (scripts/clear-lists.ts).
 */

/**
 * Each participant's answers in the answers game, one row each, made by
 * their first answer, or by their first connection if that comes first.
 */
export const answers = mysqlTable("answers", {
  userId: userId("user_id").primaryKey(),
  /**
   * The answered questions, from question ID to choice ID. An ID the event's
   * list no longer has stays here, and nothing shows it.
   */
  choices: json("choices").$type<Record<string, string>>().notNull(),
  /**
   * When their first connection fixed the answers, or null while they can
   * still change them. Fixed answers keep a match already shown true.
   */
  fixedAt: isoTimestamp("fixed_at"),
});

/**
 * Each pair's connection request, one row per pair, by its two user IDs, the
 * smaller first. A pair has one request waiting at most, because a tap back
 * accepts it. The row stays when the request goes, since every tap locks it,
 * so two taps at once take turns.
 */
export const meetingHalves = mysqlTable(
  "meeting_halves",
  {
    userA: userId("user_a").notNull(),
    userB: userId("user_b").notNull(),
    /**
     * When `userA` sent the request waiting for `userB`, or null. A time here with no
     * `requestId` is a half from before requests (BAC-149), which counts for nothing.
     */
    aMetAt: isoTimestamp("a_met_at"),
    /** When `userB` sent the request waiting for `userA`, or null, as for `aMetAt`. */
    bMetAt: isoTimestamp("b_met_at"),
    /** The waiting request's own ID, since /me gives no other person's user ID, or null for none. */
    requestId: connectionRequestId("request_id"),
  },
  (t) => [
    primaryKey({ columns: [t.userA, t.userB] }),
    uniqueIndex("meeting_halves_request_id_idx").on(t.requestId),
    // /me reads the requests waiting for a user from either side.
    index("meeting_halves_user_b_idx").on(t.userB),
  ],
);

/**
 * The connections, one per pair, by its two user IDs, the smaller first, so
 * a pair connects once. What each person saw when it was made is kept with
 * it, so a later change can't alter it.
 */
export const connections = mysqlTable(
  "connections",
  {
    /** The connection's own ID, since /me gives no other person's user ID (BAC-156). */
    id: connectionId("id")
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    userA: userId("user_a").notNull(),
    userB: userId("user_b").notNull(),
    /**
     * Each one's kind when they connected, or null for none, which only a connection across
     * groups can have (BAC-140).
     */
    kindA: varchar("kind_a", { length: TOKEN_KIND_MAX }),
    kindB: varchar("kind_b", { length: TOKEN_KIND_MAX }),
    connectedAt: isoTimestamp("connected_at").notNull(),
    /** The questions both answered the same, out of those both answered, as a whole percent, or null for none in common. */
    matchPercent: int("match_percent"),
    /** Each person's die, kept at connection time (the API agreement's 8.1, BAC-150). Null before dice. */
    rollA: int("roll_a"),
    rollB: int("roll_b"),
    /**
     * The game the pair got, chosen when they connected (the API agreement's 8.1, BAC-156), or null for a connection from
     * before the choice, which has dice if it has rolls.
     */
    game: varchar("game", { length: 8 }).$type<"dice" | "reaction">(),
    /**
     * Each person's reaction time in milliseconds, as their phone measured it, or null without
     * one. A play with no time is a tap before the signal (BAC-156).
     */
    reactionAMs: int("reaction_a_ms"),
    reactionBMs: int("reaction_b_ms"),
    /** When each person's play reached the Event Service, or null until they play. */
    reactionAAt: isoTimestamp("reaction_a_at"),
    reactionBAt: isoTimestamp("reaction_b_at"),
    /** The IDs of the questions both answered the same, in the questions' order. */
    shared: json("shared").$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userA, t.userB] }),
    // A play finds its connection by ID (8.11).
    uniqueIndex("connections_id_idx").on(t.id),
    // /me reads a user's connections from either side.
    index("connections_user_b_idx").on(t.userB),
    // The map reads them oldest first.
    index("connections_connected_at_idx").on(t.connectedAt),
  ],
);
