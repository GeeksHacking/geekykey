import { boolean, index, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { duelId, isoTimestamp, stationId, userId } from "../../db/columns.ts";

/** Team duels' records (BAC-155, draft for the agreement's next version). */
export const duelRounds = mysqlTable(
  "duel_rounds",
  {
    id: duelId("id").primaryKey(),
    stationId: stationId("station_id").notNull(),
    openedAt: isoTimestamp("opened_at").notNull(),
    closesAt: isoTimestamp("closes_at").notNull(),
    endedAt: isoTimestamp("ended_at"),
    formedAt: isoTimestamp("formed_at"),
    challenge: varchar("challenge", { length: 8 }).$type<"dice" | "reaction">(),
  },
  (t) => [index("duel_rounds_station_idx").on(t.stationId)],
);

export const duelRoundPlayers = mysqlTable(
  "duel_round_players",
  {
    roundId: duelId("round_id").notNull(),
    userId: userId("user_id").notNull(),
    joinedAt: isoTimestamp("joined_at").notNull(),
    won: boolean("won").notNull().default(false),
    team: varchar("team", { length: 1 }).$type<"a" | "b">(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.userId] }),
    index("duel_round_players_user_idx").on(t.userId),
  ],
);

export const duels = mysqlTable(
  "duels",
  {
    id: duelId("id").primaryKey(),
    roundId: duelId("round_id").notNull(),
    userA: userId("user_a").notNull(),
    userB: userId("user_b").notNull(),
    rollA: int("roll_a"),
    rollB: int("roll_b"),
    reactionAMs: int("reaction_a_ms"),
    reactionBMs: int("reaction_b_ms"),
    reactionAAt: isoTimestamp("reaction_a_at"),
    reactionBAt: isoTimestamp("reaction_b_at"),
  },
  (t) => [index("duels_round_idx").on(t.roundId)],
);
