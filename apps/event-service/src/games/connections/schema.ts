import { TOKEN_KIND_MAX } from "@geekykey/handoff";
import { index, int, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { isoTimestamp, userId } from "../../db/columns.ts";

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
 * The halves of each pair's connection, one row per pair, by its two user
 * IDs, the smaller first. Each half is when one of them last tapped the
 * other's token, and goes when the two connect. The row stays, since every
 * half locks it, so two halves at once take turns.
 */
export const meetingHalves = mysqlTable(
  "meeting_halves",
  {
    userA: userId("user_a").notNull(),
    userB: userId("user_b").notNull(),
    /** When `userA` last tapped a token of `userB`'s, or null for no half. */
    aMetAt: isoTimestamp("a_met_at"),
    /** When `userB` last tapped a token of `userA`'s, or null for no half. */
    bMetAt: isoTimestamp("b_met_at"),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] })],
);

/**
 * The connections, one per pair, by its two user IDs, the smaller first, so
 * a pair connects once. What each person saw when it was made is kept with
 * it, so a later change can't alter it.
 */
export const connections = mysqlTable(
  "connections",
  {
    userA: userId("user_a").notNull(),
    userB: userId("user_b").notNull(),
    kindA: varchar("kind_a", { length: TOKEN_KIND_MAX }).notNull(),
    kindB: varchar("kind_b", { length: TOKEN_KIND_MAX }).notNull(),
    connectedAt: isoTimestamp("connected_at").notNull(),
    /** The questions both answered the same, out of those both answered, as a whole percent, or null for none in common. */
    matchPercent: int("match_percent"),
    /** The IDs of the questions both answered the same, in the questions' order. */
    shared: json("shared").$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userA, t.userB] }),
    // /me reads a user's connections from either side.
    index("connections_user_b_idx").on(t.userB),
    // The map reads them oldest first.
    index("connections_connected_at_idx").on(t.connectedAt),
  ],
);
