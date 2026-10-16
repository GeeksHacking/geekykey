import { index, mysqlTable } from "drizzle-orm/mysql-core";
import { isoNow, isoTimestamp, tokenUid, userId } from "../db/columns.ts";

/**
 * The claims stand-in's one table: who owns each token, until the GeekyKey
 * Service asks the Portal instead. It holds current owners only: releasing a
 * token deletes its row. Timestamps are ISO strings, not DATETIME:
 * src/db/columns.ts says why.
 *
 * GeekyKey's stand-in, removed after the switch.
 */
export const tokens = mysqlTable(
  "tokens",
  {
    uid: tokenUid("uid").primaryKey(),
    /** A user ID, with no foreign key: no foreign key crosses into the Event side's tables. */
    userId: userId("user_id").notNull(),
    claimedAt: isoTimestamp("claimed_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("tokens_user_id_idx").on(t.userId)],
);

export type Token = typeof tokens.$inferSelect;
