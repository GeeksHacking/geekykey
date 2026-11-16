import { notInArray, sql } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { tokens } from "./claims-stand-in/schema.ts";
import type { Db } from "./db/pool.ts";
import { userKinds, users } from "./event/schema.ts";
import { clearedTables } from "./event-tables.ts";

/*
  The Groups screen's reset of every participant (the API agreement's 9.22), for a booth that
  demos with the same phones and tokens again and again. It empties what the event clear
  empties, all in one transaction, but keeps the accounts of the organizers and the map screens,
  with their tokens and kinds, so they stay logged in. Everyone else is logged out at their next
  request, as after the clear, and their tokens are free to claim again. Stations, the groups
  themselves, token kinds and the event's settings stay, as the clear keeps them.

  It lives here, not in src/event/, because it empties every game's tables, which only this
  level may import (CODING_STANDARDS.md, "Games").
*/

/** The tables that keep the rows of the people the reset keeps, by the column naming them. */
const keptPeople = new Map<MySqlTable, MySqlColumn>([
  [users, users.id],
  [tokens, tokens.userId],
  [userKinds, userKinds.userId],
]);

/** What a reset removed, for its log line. */
export interface ResetOutcome {
  /** The participants whose accounts went. */
  participants: number;
}

/** Resets every participant, keeping the users in `keep`: the organizers and the map screens. */
export async function resetParticipants(db: Db, keep: ReadonlySet<string>): Promise<ResetOutcome> {
  return db.transaction(async (tx) => {
    let participants = 0;
    for (const table of clearedTables) {
      const column = keptPeople.get(table);
      const where = column && keep.size > 0 ? notInArray(column, [...keep]) : sql`true`;
      const [result] = await tx.delete(table).where(where);
      if (table === users) participants = result.affectedRows;
    }
    return { participants };
  });
}
