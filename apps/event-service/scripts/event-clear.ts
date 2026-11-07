/**
 * The event clear (spec, checkpoint 8): takes a copy, shows the row counts,
 * asks for the database's name, empties the event's data and shows the counts
 * again. clear-test-data.ts is the command that runs it; event-clear.test.ts
 * runs it against the Docker TiDB.
 */
import { getTableName } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { clearedTables, keptTables } from "./clear-lists.ts";
import { tableNames, writeCopy } from "./database-copy.ts";
import { PRODUCTION } from "./logins.ts";

export interface ClearOptions {
  /** The folder the copy goes in, made if it's missing. */
  copyDir: string;
  /** When the copy is taken, which names its file. */
  now: Date;
  /** Whether a person can type the name, rather than a pipe sending it. */
  atTerminal: boolean;
  /** Asks the person running the clear this question, and gives back what they typed. */
  typeDatabaseName: (question: string) => Promise<string>;
  print: (line: string) => void;
}

const names = (tables: readonly MySqlTable[]) => tables.map((table) => getTableName(table));

/**
 * Empties `clearedTables` in the connection's database, all of them or none,
 * if the person running it types that database's name, and keeps `keptTables`.
 *
 * It answers `not_confirmed` for any other name, and `changed_since_copy`,
 * having emptied nothing, if a table on the cleared list changed size while the
 * name was being typed, since the copy doesn't hold those rows. It answers
 * `rows_left` if the clear went through but something has written to a table
 * since. It throws, having emptied nothing, if a table is on neither list, the
 * copy fails, or production's name would come from anywhere but a terminal, so
 * a script can't clear production by mistake.
 */
export async function clearEvent(
  connection: Connection,
  { copyDir, now, atTerminal, typeDatabaseName, print }: ClearOptions,
): Promise<"cleared" | "not_confirmed" | "changed_since_copy" | "rows_left"> {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS name");
  const database = rows[0]!.name as string;
  if (database === PRODUCTION.database && !atTerminal) {
    throw new Error(
      `${database} is production's database, and its clear needs Adam at a terminal to type its ` +
        "name. Nothing was emptied.",
    );
  }
  await refuseUnlistedTables(connection);

  const copy = await writeCopy(connection, database, copyDir, now).catch((cause: unknown) => {
    throw new Error(`The copy failed, so nothing was emptied: ${String(cause)}`, { cause });
  });
  print(`Database: ${database}`);
  print(`Copy:     ${copy.path} (${copy.rows} rows)`);
  const before = await printCounts(connection, "Before the clear", print);

  const typed = await typeDatabaseName(
    "Type this database's name to empty the event's data, or anything else to stop: ",
  );
  if (typed !== database) {
    print("That isn't this database's name. Nothing was emptied.");
    return "not_confirmed";
  }

  const changed = (await rowCounts(connection, clearedTables)).filter(
    ([name, count]) => count !== before[name],
  );
  if (changed.length > 0) {
    print(
      `${changed.map(([name]) => name).join(", ")} changed since the copy. ` +
        "Nothing was emptied. Stop whatever is writing, and run this again for a new copy.",
    );
    return "changed_since_copy";
  }

  // In one transaction, not TRUNCATE, so a failure partway leaves everything as it was.
  await connection.beginTransaction();
  try {
    for (const name of names(clearedTables)) {
      await connection.query("DELETE FROM ??", [name]);
    }
    await connection.commit();
  } catch (cause) {
    await connection.rollback();
    throw new Error(`The clear failed, so nothing was emptied: ${String(cause)}`, { cause });
  }

  const after = await printCounts(connection, "After the clear", print);
  const left = names(clearedTables).filter((name) => after[name] !== 0);
  if (left.length > 0) {
    print(`The clear went through, but something has written to these since: ${left.join(", ")}`);
    return "rows_left";
  }
  print("Cleared: 0 taps, 0 claims and 0 users, as expected.");
  return "cleared";
}

/**
 * Stops if the database and the lists disagree: an older checkout would miss a
 * new game's records, and leave them for the next session.
 */
async function refuseUnlistedTables(connection: Connection): Promise<void> {
  const inDatabase = (await tableNames(connection)).filter(
    // Drizzle's own record of the migrations it ran.
    (name) => name !== "__drizzle_migrations",
  );
  const listed = names([...clearedTables, ...keptTables]);
  const onNeither = inDatabase.filter((name) => !listed.includes(name));
  const missing = listed.filter((name) => !inDatabase.includes(name));
  if (onNeither.length + missing.length === 0) return;
  throw new Error(
    "This checkout and the database disagree, so nothing was emptied. " +
      `On neither list in clear-lists.ts: ${onNeither.join(", ") || "none"}. ` +
      `Listed but not in the database: ${missing.join(", ") || "none"}.`,
  );
}

/** Each table's name and row count, in the list's order. */
async function rowCounts(
  connection: Connection,
  tables: readonly MySqlTable[],
): Promise<[string, number][]> {
  const counts: [string, number][] = [];
  for (const name of names(tables)) {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM ??", [name]);
    counts.push([name, Number(rows[0]!.n)]);
  }
  return counts;
}

/** Prints each table's row count, and gives them back by table. */
async function printCounts(
  connection: Connection,
  heading: string,
  print: (line: string) => void,
): Promise<Record<string, number>> {
  const all: [string, number][] = [];
  print("");
  print(`${heading}:`);
  for (const [listName, tables] of [
    ["The clear empties", clearedTables],
    ["The clear keeps", keptTables],
  ] as const) {
    print(`  ${listName}:`);
    for (const [name, count] of await rowCounts(connection, tables)) {
      print(`    ${name.padEnd(20)} ${count}`);
      all.push([name, count]);
    }
  }
  print("");
  return Object.fromEntries(all);
}
