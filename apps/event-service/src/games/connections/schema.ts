import { json, mysqlTable } from "drizzle-orm/mysql-core";
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
