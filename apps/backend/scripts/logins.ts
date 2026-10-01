/**
 * Creates the geekykey database on a TiDB cluster, and the two logins the
 * backend reaches it with, from a connection with the cluster's root login.
 * create-logins.ts runs it against GeeksHacking's cluster; logins.test.ts runs
 * it against the Docker TiDB.
 */
import { randomBytes } from "node:crypto";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Connection, RowDataPacket } from "mysql2/promise";

/** The one database both services' tables live in. */
export const DATABASE = "geekykey";

/** What each login may do in `geekykey`, and nowhere else. */
const APP_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE";
const MIGRATION_PRIVILEGES = `${APP_PRIVILEGES}, CREATE, ALTER, DROP, INDEX, REFERENCES`;

export interface LoginNames {
  /** Reads and writes rows. The Workers use it, through Hyperdrive. */
  app: string;
  /** Can also create, change and drop tables. `db:migrate` uses it. */
  migration: string;
}

/**
 * TiDB Cloud names every login on a cluster with the cluster's prefix, as in
 * `3pTAoNNegb47Uc8.root`, so ours carry the root login's prefix too. The
 * Docker TiDB's root login has none.
 */
export function loginNames(rootUser: string): LoginNames {
  const prefix = rootUser.slice(0, rootUser.lastIndexOf(".") + 1);
  const names = { app: `${prefix}geekykey_app`, migration: `${prefix}geekykey_migrate` };
  // With today's 16-character prefixes, the migration login's name is exactly
  // as long as TiDB allows.
  if (names.migration.length > 32) {
    throw new Error(
      `${names.migration} is longer than the 32 characters TiDB allows in a user name.`,
    );
  }
  return names;
}

export interface LoginOptions {
  /** The env file the migration login is saved to, as TIDB_MIGRATION_URL. */
  savePath: string;
  /** Give the app login a new password, and hand the login back. */
  newAppPassword?: boolean;
  /** Give the migration login a new password, and save that. */
  newMigrationPassword?: boolean;
}

/**
 * Creates whatever is missing: the database, either login, and what each may
 * do. What already exists stays as it is, passwords included, unless a new
 * password is asked for.
 *
 * The migration login is saved to `savePath`, readable only by its owner.
 * The app login's password is saved nowhere: it's handed back, as a
 * `mysql://` URL, only when a new one is asked for.
 */
export async function ensureLogins(
  root: Connection,
  options: LoginOptions,
): Promise<{ appUrl?: string }> {
  const names = loginNames(root.config.user ?? "");
  const migrationExists = await loginExists(root, names.migration);
  if (migrationExists && !options.newMigrationPassword && !(await fileExists(options.savePath))) {
    throw new Error(
      `${names.migration} already exists, but its saved copy at ${options.savePath} is missing, ` +
        "so nobody knows its password. Run again with --new-migration-password to give it a " +
        "new one and save that.",
    );
  }

  await root.query(
    `CREATE DATABASE IF NOT EXISTS ${DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
  );

  if (!migrationExists || options.newMigrationPassword) {
    const password = newPassword();
    // Written beside the saved copy, and moved over it only once TiDB has the
    // password, so the saved copy never holds one the login doesn't have.
    const pending = `${options.savePath}.new`;
    await writeMigrationLogin(loginUrl(root, names.migration, password), pending);
    try {
      await setPassword(root, names.migration, password, migrationExists);
    } catch (error) {
      await rm(pending, { force: true });
      throw error;
    }
    await rename(pending, options.savePath);
  }
  await root.query(`GRANT ${MIGRATION_PRIVILEGES} ON ${DATABASE}.* TO ?@'%'`, [names.migration]);

  // A new app login's password is thrown away unless it was asked for: the
  // first deploy asks for a new one when it creates the Hyperdrive config.
  const appExists = await loginExists(root, names.app);
  const appPassword = newPassword();
  if (!appExists || options.newAppPassword) {
    await setPassword(root, names.app, appPassword, appExists);
  }
  await root.query(`GRANT ${APP_PRIVILEGES} ON ${DATABASE}.* TO ?@'%'`, [names.app]);

  return { appUrl: options.newAppPassword ? loginUrl(root, names.app, appPassword) : undefined };
}

async function loginExists(root: Connection, name: string): Promise<boolean> {
  const [rows] = await root.query<RowDataPacket[]>(
    "SELECT 1 FROM mysql.user WHERE User = ? AND Host = '%'",
    [name],
  );
  return rows.length > 0;
}

/** Creates the login with this password, or changes the password of the one there. */
async function setPassword(
  root: Connection,
  name: string,
  password: string,
  exists: boolean,
): Promise<void> {
  const statement = exists ? "ALTER USER" : "CREATE USER";
  await root.query(`${statement} ?@'%' IDENTIFIED BY ?`, [name, password]);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 32 random bytes, URL-safe, so it goes into a connection string as it is. */
function newPassword(): string {
  return randomBytes(32).toString("base64url");
}

/** A login to `geekykey`, on the cluster `root` is connected to. */
function loginUrl(root: Connection, user: string, password: string): string {
  const { host, port } = root.config;
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${DATABASE}`;
}

/** Writes the login to `path`, readable only by its owner. */
async function writeMigrationLogin(url: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const file = await open(path, "w", 0o600);
  try {
    // The mode above only applies to a new file, so tighten one left over from
    // an earlier run too, before the password goes in.
    await file.chmod(0o600);
    await file.writeFile(`TIDB_MIGRATION_URL=${url}\n`);
  } finally {
    await file.close();
  }
}
