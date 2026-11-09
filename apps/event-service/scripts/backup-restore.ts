/**
 * The copy and the restore (spec, checkpoint 8). `backUp` writes every table to
 * a copy, as the clear does first. `restoreTables` puts chosen tables back from
 * a copy and leaves every other table as it is, so restoring taps doesn't undo
 * the claims made since. backup.ts and restore.ts are the commands that run
 * them; backup-restore.test.ts runs them against the Docker TiDB.
 */
import type { Connection, RowDataPacket } from "mysql2/promise";
import { type Copy, readCopy, tableNames, writeCopy } from "./database-copy.ts";
import { PRODUCTION } from "./logins.ts";

/** Drizzle's own record of the migrations it ran, which only db:migrate changes. */
const MIGRATIONS_TABLE = "__drizzle_migrations";

/** How many rows go in one INSERT, to keep each statement small. */
const ROWS_PER_INSERT = 500;

/** The name of the database the connection uses. */
async function currentDatabase(connection: Connection): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS name");
  return rows[0]!.name as string;
}

/**
 * Writes a copy of the connection's database into `copyDir`, as the clear
 * does, and prints where it went and each table's row count.
 */
export async function backUp(
  connection: Connection,
  { copyDir, now, print }: { copyDir: string; now: Date; print: (line: string) => void },
): Promise<{ path: string; rows: number }> {
  const database = await currentDatabase(connection);
  const copy = await writeCopy(connection, database, copyDir, now);
  print(`Database: ${database}`);
  print(`Copy:     ${copy.path} (${copy.rows} rows)`);
  print("");
  for (const [name, count] of Object.entries(copy.counts)) {
    if (name !== MIGRATIONS_TABLE) print(`  ${name.padEnd(20)} ${count}`);
  }
  return copy;
}

export interface RestoreOptions {
  /** The copy to restore from, written by db:backup or db:clear-test-data. */
  file: string;
  /** The tables to put back. Every other table stays as it is. */
  tables: readonly string[];
  /** The folder the restore's own copy goes in, taken first so a restore can be undone. */
  copyDir: string;
  /** When that copy is taken, which names its file. */
  now: Date;
  /** Whether a person can type the name, rather than a pipe sending it. */
  atTerminal: boolean;
  /** Asks the person running the restore this question, and gives back what they typed. */
  typeDatabaseName: (question: string) => Promise<string>;
  print: (line: string) => void;
}

/**
 * Makes each of `tables` hold exactly the copy's rows, all of them or none, if
 * the person running it types the database's name. Rows written since the copy
 * go, rows the copy holds come back, and every other table stays as it is.
 *
 * It takes a copy of the database as it is first, so a restore can be undone
 * with another. It answers `not_confirmed` for any other name, and
 * `changed_since_copy`, having changed nothing, if one of the tables changed
 * size while the name was being typed, since that copy doesn't hold those rows.
 * It answers `counts_differ` if the restore went through but a table's count
 * isn't the copy's, because something wrote to it since.
 *
 * It throws, having changed nothing, if the copy is of another database, a
 * table isn't in the copy or the database, the copy has a column the table
 * doesn't, the restore would leave a row pointing at one that isn't there, or
 * production's name would come from anywhere but a terminal.
 */
export async function restoreTables(
  connection: Connection,
  { file, tables, copyDir, now, atTerminal, typeDatabaseName, print }: RestoreOptions,
): Promise<"restored" | "not_confirmed" | "changed_since_copy" | "counts_differ"> {
  const database = await currentDatabase(connection);
  if (database === PRODUCTION.database && !atTerminal) {
    throw new Error(
      `${database} is production's database, and its restore needs Adam at a terminal to type ` +
        "its name. Nothing was restored.",
    );
  }
  const copy = await readCopy(file);
  const jsonColumns = await refuseWhatCantBeRestored(connection, database, copy, tables);

  const ownCopy = await writeCopy(connection, database, copyDir, now).catch((cause: unknown) => {
    const reason = `The copy of the tables as they are failed, so nothing was restored`;
    throw new Error(`${reason}: ${String(cause)}`, { cause });
  });
  print(`Database:     ${database}`);
  print(`Restore from: ${file}, taken at ${copy.taken_at}`);
  print(`Copy of now:  ${ownCopy.path} (${ownCopy.rows} rows)`);
  print("");
  print(`  ${"".padEnd(20)} ${"now".padStart(8)} ${"in the copy".padStart(12)}`);
  // The copy's own counts, so a write between the copy and a count can't slip past the check below.
  const before = ownCopy.counts;
  for (const name of tables) {
    print(
      `  ${name.padEnd(20)} ${String(before[name]).padStart(8)} ${String(copy.tables[name]!.length).padStart(12)}`,
    );
  }
  print("");

  const typed = await typeDatabaseName(
    "Type this database's name to put these tables back as they are in the copy, or anything else to stop: ",
  );
  if (typed !== database) {
    print("That isn't this database's name. Nothing was restored.");
    return "not_confirmed";
  }

  const counts = await rowCounts(connection, tables);
  const changed = tables.filter((name) => counts[name] !== before[name]);
  if (changed.length > 0) {
    print(
      `${changed.join(", ")} changed since the copy of now. Nothing was restored. ` +
        "Stop whatever is writing, and run this again for a new copy.",
    );
    return "changed_since_copy";
  }

  // Foreign keys are checked once all the tables are back, not row by row, so
  // `stations` can be emptied and filled while taps point at it.
  await connection.query("SET foreign_key_checks = 0");
  await connection.beginTransaction();
  try {
    for (const name of tables) {
      await connection.query("DELETE FROM ??", [name]);
      await insertRows(connection, name, copy.tables[name]!, jsonColumns[name]!);
    }
    await refuseBrokenReferences(connection, tables);
    await connection.commit();
  } catch (cause) {
    await connection.rollback();
    throw new Error(`The restore failed, so nothing was restored: ${String(cause)}`, { cause });
  } finally {
    await connection.query("SET foreign_key_checks = 1");
  }

  const after = await rowCounts(connection, tables);
  print("After the restore:");
  for (const name of tables) print(`  ${name.padEnd(20)} ${after[name]}`);
  print("");
  const differ = tables.filter((name) => after[name] !== copy.tables[name]!.length);
  if (differ.length > 0) {
    print(
      `The restore went through, but something has written to these since: ${differ.join(", ")}`,
    );
    return "counts_differ";
  }
  print("Restored: each table holds the copy's rows.");
  return "restored";
}

/**
 * Stops before anything changes if the copy can't be put back as asked, and
 * gives back each chosen table's JSON columns.
 */
async function refuseWhatCantBeRestored(
  connection: Connection,
  database: string,
  copy: Copy,
  tables: readonly string[],
): Promise<Record<string, Set<string>>> {
  const refuse = (reason: string) => new Error(`${reason} Nothing was restored.`);
  if (copy.database !== database) {
    throw refuse(`The copy is of ${copy.database}, and this is ${database}.`);
  }
  if (tables.length === 0) throw refuse("Name the tables to restore with --tables.");
  if (new Set(tables).size !== tables.length) throw refuse("A table is named twice.");
  if (tables.includes(MIGRATIONS_TABLE)) {
    throw refuse(`${MIGRATIONS_TABLE} is db:migrate's, and a restore leaves it alone.`);
  }
  const inDatabase = await tableNames(connection);
  const notInCopy = tables.filter((name) => !(name in copy.tables));
  if (notInCopy.length > 0) throw refuse(`The copy doesn't hold ${notInCopy.join(", ")}.`);
  const notInDatabase = tables.filter((name) => !inDatabase.includes(name));
  if (notInDatabase.length > 0) {
    throw refuse(`${database} has no table called ${notInDatabase.join(", ")}.`);
  }

  const jsonColumns: Record<string, Set<string>> = {};
  for (const name of tables) {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [name],
    );
    const inTable = new Set(rows.map((row) => row.name as string));
    const extra = [...new Set(copy.tables[name]!.flatMap((row) => Object.keys(row)))].filter(
      (column) => !inTable.has(column),
    );
    if (extra.length > 0) {
      throw refuse(
        `The copy's ${name} has columns the table no longer has: ${extra.join(", ")}. ` +
          "A migration has changed it since.",
      );
    }
    jsonColumns[name] = new Set(rows.filter((row) => row.type === "json").map((row) => row.name));
  }
  return jsonColumns;
}

/**
 * Inserts the copy's rows into `table`. mysql2 hands JSON columns back parsed,
 * so they go in as JSON text again.
 */
async function insertRows(
  connection: Connection,
  table: string,
  rows: readonly Record<string, unknown>[],
  jsonColumns: Set<string>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    const batch = rows.slice(start, start + ROWS_PER_INSERT);
    const names = Object.keys(batch[0]!);
    const values = batch.map((row) =>
      names.map((column) => {
        const value = row[column];
        return jsonColumns.has(column) && value !== null ? JSON.stringify(value) : value;
      }),
    );
    await connection.query("INSERT INTO ?? (??) VALUES ?", [table, names, values]);
  }
}

/**
 * Throws if a foreign key touching one of `tables` now points at a row that
 * isn't there, such as a tap at a station the copy doesn't hold.
 */
async function refuseBrokenReferences(
  connection: Connection,
  tables: readonly string[],
): Promise<void> {
  const [keys] = await connection.query<RowDataPacket[]>(
    "SELECT CONSTRAINT_NAME AS name, TABLE_NAME AS child, COLUMN_NAME AS childColumn, " +
      "REFERENCED_TABLE_NAME AS parent, REFERENCED_COLUMN_NAME AS parentColumn " +
      "FROM information_schema.KEY_COLUMN_USAGE " +
      "WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL " +
      "ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION",
  );
  const byKey = new Map<string, RowDataPacket[]>();
  for (const key of keys) {
    byKey.set(`${key.child}.${key.name}`, [...(byKey.get(`${key.child}.${key.name}`) ?? []), key]);
  }
  const broken: string[] = [];
  for (const parts of byKey.values()) {
    const { child, parent } = parts[0]!;
    if (!tables.includes(child) && !tables.includes(parent)) continue;
    const matches = parts.map(() => "p.?? = c.??").join(" AND ");
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ?? AS c WHERE ${parts.map(() => "c.?? IS NOT NULL").join(" AND ")} ` +
        `AND NOT EXISTS (SELECT 1 FROM ?? AS p WHERE ${matches})`,
      [
        child,
        ...parts.map((part) => part.childColumn),
        parent,
        ...parts.flatMap((part) => [part.parentColumn, part.childColumn]),
      ],
    );
    const n = Number(rows[0]!.n);
    if (n > 0) {
      broken.push(`${n} rows in ${child} would point at rows in ${parent} that aren't there`);
    }
  }
  if (broken.length > 0) {
    throw new Error(`${broken.join("; ")}. Restore both tables together.`);
  }
}

/** Each table's row count, by name. */
async function rowCounts(
  connection: Connection,
  tables: readonly string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of tables) {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM ??", [name]);
    counts[name] = Number(rows[0]!.n);
  }
  return counts;
}
