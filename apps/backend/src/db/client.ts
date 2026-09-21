import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

export type Db = LibSQLDatabase<typeof schema>;

/** `file:` for local SQLite, `libsql://` plus auth token for Turso. Same code either way. */
export function createDb(url: string, authToken?: string): Db {
  return drizzle(createClient({ url, authToken }), { schema });
}

/** libSQL creates the database file but not its parent directory. */
export async function ensureLocalDbDir(url: string): Promise<void> {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length);
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir) await Deno.mkdir(dir, { recursive: true });
}
