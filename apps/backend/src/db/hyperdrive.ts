import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";

export type Db = MySql2Database;

/** The database for one request, and how to let go of it afterwards. */
export interface RequestDb {
  db: Db;
  /** Closes the request's connection, if it opened one. */
  close(): Promise<void>;
}

/**
 * The database for one request, through the Hyperdrive binding. A Worker can't
 * keep a connection open between requests, so each request makes its own and
 * Hyperdrive keeps the real connections to TiDB open between them.
 *
 * It's a pool of one connection rather than the connection itself, so it
 * connects only when the request first uses the database.
 */
export function createRequestDb(hyperdrive: Hyperdrive): RequestDb {
  const pool = createPool({
    host: hyperdrive.host,
    port: hyperdrive.port,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    connectionLimit: 1,
    // mysql2 otherwise builds its row parsers with eval(), which Workers don't allow.
    disableEval: true,
  });
  return { db: drizzle({ client: pool }), close: () => pool.end() };
}
