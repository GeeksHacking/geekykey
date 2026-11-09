/**
 * A copy of a database, written to a file on the laptop running the script
 * (spec, checkpoint 8). It holds user IDs, names and contact lines, so it stays
 * on that laptop, never in GitHub or a chat.
 */
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

/** What a copy file holds: each table's rows, by their column names. */
const copySchema = z.object({
  database: z.string(),
  taken_at: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type Copy = z.infer<typeof copySchema>;

/** The copy in the file at `path`, or an error saying the file isn't one. */
export async function readCopy(path: string): Promise<Copy> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path, "utf8"));
  } catch {
    json = undefined;
  }
  const parsed = copySchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`${path} isn't a copy from db:backup or db:clear-test-data.`);
  }
  return parsed.data;
}

/** The tables in the connection's database. */
export async function tableNames(connection: Connection): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>("SHOW TABLES");
  return rows.map((row) => Object.values(row)[0] as string);
}

/**
 * Writes every table's rows, by their column names, to a new file in `dir` as
 * `{ database, taken_at, tables: { <table>: [<row>...] } }`, readable only by
 * its owner. All the rows come from one moment, so a tap arriving midway can't
 * leave the copy disagreeing with itself. The file only gets its name once
 * it's whole and on disk, so a failed copy can't pass for a good one.
 */
export async function writeCopy(
  connection: Connection,
  database: string,
  dir: string,
  now: Date,
): Promise<{ path: string; rows: number; counts: Record<string, number> }> {
  const tables: Record<string, RowDataPacket[]> = {};
  const takenAt = now.toISOString();
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  try {
    for (const name of await tableNames(connection)) {
      [tables[name]] = await connection.query<RowDataPacket[]>("SELECT * FROM ??", [name]);
    }
  } finally {
    await connection.rollback();
  }

  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Colons are awkward in a file name, on a Mac especially.
  const path = join(dir, `${database}-${takenAt.replaceAll(":", "-")}.json`);
  const partial = `${path}.partial`;
  const file = await open(partial, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify({ database, taken_at: takenAt, tables }));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(partial, path);
  const counts = Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.length]),
  );
  return { path, rows: Object.values(counts).reduce((sum, count) => sum + count, 0), counts };
}
