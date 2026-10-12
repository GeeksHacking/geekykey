import { index, mysqlTable } from "drizzle-orm/mysql-core";
import { isoNow, isoTimestamp, tokenUid, userId } from "../db/columns.ts";

/**
 * The claims stand-in's one table: who owns each token, until the GeekyKey
 * Service asks the Portal instead.
 *
 * GeekyKey's stand-in, removed after the switch.
 */
export const tokens = mysqlTable(
  "tokens",
  {
    uid: tokenUid("uid").primaryKey(),
    /** A user ID, with no foreign key: no foreign key crosses into the Event side's tables. */
    userId: userId("user_id").notNull(),
    pairedAt: isoTimestamp("paired_at").notNull().$defaultFn(isoNow),
    revokedAt: isoTimestamp("revoked_at"),
  },
  (t) => [index("tokens_user_id_idx").on(t.userId)],
);

export type Token = typeof tokens.$inferSelect;
