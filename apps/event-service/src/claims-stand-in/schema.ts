import { TOKEN_KIND_MAX } from "@geekykey/handoff";
import { index, mysqlTable, varchar } from "drizzle-orm/mysql-core";
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

/**
 * Each token's kind (ADR 0006), from the token writer's log: `pnpm
 * db:token-kinds` loads it. The kind is the one letter the writer wrote into
 * the token's address, such as `E`. Each event decides what a kind means; this
 * list only says which token carries which. A token not in it has no kind.
 *
 * The kind belongs to the token, not to one event, so clearing an event's data
 * keeps it. It isn't the Event Service's either: an Event Service sees a
 * user's kind in the hand-off and the login link, never a UID. No foreign key
 * to `tokens`, since a token has its kind before anyone claims it.
 *
 * GeekyKey's stand-in, removed or kept as GeekyKey's own at the switch.
 */
export const tokenKinds = mysqlTable("token_kinds", {
  uid: tokenUid("uid").primaryKey(),
  kind: varchar("kind", { length: TOKEN_KIND_MAX }).notNull(),
});
