import { index, int, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { isoTimestamp, stationId, userId } from "../../db/columns.ts";

export type EndedHow = "won" | "lost_tries" | "lost_time" | "too_few" | "no_target";
export interface StoredHint {
  questionId: string;
  choiceId: string;
}

/** BAC-203, the API agreement's section 4, next version after 0.14. No target identity is kept. */
export const hintHuntRounds = mysqlTable(
  "hint_hunt_rounds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    stationId: stationId("station_id").notNull(),
    openedAt: isoTimestamp("opened_at").notNull(),
    joiningUntil: isoTimestamp("joining_until").notNull(),
    startedAt: isoTimestamp("started_at"),
    hints: json("hints").$type<StoredHint[]>().notNull(),
    hintsAnnounced: int("hints_announced").notNull().default(0),
    triesLeft: int("tries_left").notNull(),
    endedAt: isoTimestamp("ended_at"),
    endedHow: varchar("ended_how", { length: 16 }).$type<EndedHow>(),
  },
  (table) => [index("hint_hunt_rounds_station").on(table.stationId, table.openedAt)],
);

export const hintHuntPlayers = mysqlTable(
  "hint_hunt_players",
  {
    roundId: varchar("round_id", { length: 36 }).notNull(),
    userId: userId("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.roundId, table.userId] })],
);
