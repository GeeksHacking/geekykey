import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { type ConnectionOptions, createPool, type Pool, type PoolConnection } from "mysql2/promise";

export type Db = MySql2Database;

/** The database, and how to let go of it when the server stops. */
export interface DbPool {
  db: Db;
  /** Closes every connection, once the queries running on them have finished. */
  close(): Promise<void>;
}

/** The pool's two time limits. Only the tests change them. */
export interface DbPoolOptions {
  /** How long a connection may sit unused before it's closed. */
  idleTimeoutMs?: number;
  /** How long a connection may sit unused before it's checked with a ping. */
  checkAfterIdleMs?: number;
}

/**
 * How many connections one server opens at most. With at most two Cloud Run
 * instances, TiDB never sees more than 20 from us.
 */
const CONNECTION_LIMIT = 10;

/**
 * TLS that checks the server's certificate, and that it was issued for the
 * host we asked for: mysql2 skips that second check unless told. TiDB Cloud
 * takes nothing less than TLS.
 */
export const CHECKED_TLS = {
  minVersion: "TLSv1.2",
  rejectUnauthorized: true,
  verifyIdentity: true,
} as const;

/** This machine's names. TiDB in Docker listens on one of them, without TLS. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * The login in a `mysql://user:password@host:port/db` URL. Anything after a
 * `?` is ignored: given a URL, mysql2 would let a `?ssl=` in it turn TLS off.
 */
export function loginFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    // An IPv6 address keeps its brackets in a URL, but not in mysql2.
    host: parsed.hostname.replace(/^\[(.*)\]$/, "$1"),
    port: Number(parsed.port || 4000),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

/** How the pool connects: over checked TLS to any database not on this machine. */
export function connectionOptions(url: string): ConnectionOptions {
  const login = loginFromUrl(url);
  return LOOPBACK_HOSTS.has(login.host!) ? login : { ...login, ssl: { ...CHECKED_TLS } };
}

/**
 * The server's database: one pool of connections to the database at `url`,
 * made once at start-up and shared by every request. It connects only when a
 * request first needs it.
 *
 * Cloud Run cuts an instance's CPU between requests, so the pool's own timers
 * and keep-alives stall, and a connection can die without the pool noticing.
 * Two things guard against that:
 *
 * - A connection left unused for a minute is closed.
 * - A connection that has sat unused for more than a second gets a ping
 *   before it's handed out. If the ping fails, the connection was dead before
 *   the query was sent: it's thrown away, and the query goes on a fresh
 *   connection instead. A query is never sent twice, so one that failed
 *   partway, perhaps after TiDB ran it, is never run again.
 */
export function createDbPool(url: string, options: DbPoolOptions = {}): DbPool {
  const { idleTimeoutMs = 60_000, checkAfterIdleMs = 1_000 } = options;
  const pool = createPool({
    ...connectionOptions(url),
    connectionLimit: CONNECTION_LIMIT,
    idleTimeout: idleTimeoutMs,
    // mysql2 only closes idle connections when maxIdle is below connectionLimit.
    maxIdle: CONNECTION_LIMIT - 1,
  });

  // When each idle connection went back to the pool.
  const releasedAt = new WeakMap<object, number>();
  pool.on("release", (connection) => releasedAt.set(connection, Date.now()));

  async function getConnection(): Promise<PoolConnection> {
    const connection = await pool.getConnection();
    const idleSince = releasedAt.get(connection.connection);
    if (idleSince === undefined || Date.now() - idleSince < checkAfterIdleMs) {
      return connection;
    }
    try {
      await connection.ping();
      return connection;
    } catch {
      connection.destroy();
      // The next one may have died too, but each try uses up one dead
      // connection, and a new one is never checked.
      return await getConnection();
    }
  }

  async function withConnection<T>(use: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await getConnection();
    try {
      return await use(connection);
    } finally {
      connection.release();
    }
  }

  // Drizzle uses only these three: getConnection() for a transaction, and
  // query() and execute() for everything else. Each takes its connection
  // through the check above.
  const client = {
    getConnection,
    query: (...args: unknown[]) => withConnection((c) => Reflect.apply(c.query, c, args)),
    execute: (...args: unknown[]) => withConnection((c) => Reflect.apply(c.execute, c, args)),
  };
  return { db: drizzle({ client: client as unknown as Pool }), close: () => pool.end() };
}
