import { index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { groupId, isoTimestamp, stationId } from "../../db/columns.ts";

/** Relay records for BAC-184, the API agreement's sections 4 and 9.13. */
export const relayLock = mysqlTable("relay_lock", {
  id: int("id").primaryKey(),
});

export const relayGames = mysqlTable("relay_games", {
  id: varchar("id", { length: 36 }).primaryKey(),
  startedAt: isoTimestamp("started_at").notNull(),
  stationA: stationId("station_a").notNull(),
  stationB: stationId("station_b").notNull(),
  groupsPlaying: int("groups_playing").notNull(),
  transfersNeeded: int("transfers_needed").notNull(),
  lastMovedAt: isoTimestamp("last_moved_at").notNull(),
  /** Any tap the relay judged, which keeps the game from ending idle (BAC-184). */
  lastTapAt: isoTimestamp("last_tap_at").notNull(),
  endedAt: isoTimestamp("ended_at"),
  endedHow: varchar("ended_how", { length: 8 }).$type<"complete" | "idle">(),
});

export const relayTransfers = mysqlTable(
  "relay_transfers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    gameId: varchar("game_id", { length: 36 }).notNull(),
    fromStationId: stationId("from_station_id").notNull(),
    toStationId: stationId("to_station_id").notNull(),
    fromGroupId: groupId("from_group_id").notNull(),
    toGroupId: groupId("to_group_id").notNull(),
    calledAt: isoTimestamp("called_at").notNull(),
    closesAt: isoTimestamp("closes_at").notNull(),
    completedAt: isoTimestamp("completed_at"),
  },
  (t) => [index("relay_transfers_game_idx").on(t.gameId)],
);
