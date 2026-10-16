/**
 * How the database scripts reach GeeksHacking's TiDB Cloud cluster: straight
 * from a laptop or GitHub Actions with mysql2.
 */
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { ConnectionOptions } from "mysql2/promise";
import { CHECKED_TLS, loginFromUrl } from "../src/db/pool.ts";

/**
 * Connection options for the login in a `mysql://user:password@host:port/db`
 * URL, over TLS that checks the server's certificate. The URL can't turn that
 * off, and nor can the host: unlike the server's pool, a script never skips
 * TLS for a database on this machine.
 */
export function productionConnection(url: string): ConnectionOptions {
  return { ...loginFromUrl(url), ssl: { ...CHECKED_TLS } };
}

/**
 * The migration login, from TIDB_MIGRATION_URL. Adam runs db:migrate from
 * his laptop until the deploy workflow migrates production itself, passing
 * --env-file to name the file create-logins.ts saved.
 */
export function migrationLogin(envFile?: string): ConnectionOptions {
  const url = readEnv(envFile).TIDB_MIGRATION_URL;
  if (!url) {
    throw new Error(
      "TIDB_MIGRATION_URL isn't set. On Adam's laptop, add " +
        "--env-file ~/.config/geekykey/tidb-migration.env",
    );
  }
  return productionConnection(url);
}

/**
 * The cluster's root login, from TIDB_HOST, TIDB_USER, TIDB_PASSWORD and
 * optionally TIDB_PORT: the names in the file Julian's login is kept in.
 * Only create-logins.ts uses it, from Adam's laptop.
 */
export function rootLogin(envFile?: string): ConnectionOptions {
  const env = readEnv(envFile);
  if (!env.TIDB_HOST || !env.TIDB_USER || !env.TIDB_PASSWORD) {
    throw new Error(
      "TIDB_HOST, TIDB_USER and TIDB_PASSWORD must all be set. On Adam's laptop, add " +
        "--env-file ~/.config/geekykey/tidb.env",
    );
  }
  return {
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT || 4000),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    ssl: { ...CHECKED_TLS },
  };
}

/**
 * The variables in `envFile`, or the environment if there's no file. Only the
 * file counts when there is one, so a variable left set in the shell can't
 * quietly point a script at another login.
 */
function readEnv(envFile: string | undefined): NodeJS.Dict<string> {
  return envFile === undefined ? process.env : parseEnv(readFileSync(envFile, "utf8"));
}
