/**
 * How the database scripts reach GeeksHacking's TiDB Cloud cluster: straight
 * from a laptop or GitHub Actions with mysql2, never through Hyperdrive.
 */
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { ConnectionOptions } from "mysql2/promise";

/**
 * TLS that checks the server's certificate, and that it was issued for the
 * host we asked for: mysql2 skips that second check unless told. TiDB Cloud
 * takes nothing less than TLS.
 */
const CHECKED_TLS = {
  minVersion: "TLSv1.2",
  rejectUnauthorized: true,
  verifyIdentity: true,
} as const;

/**
 * Connection options for the login in a `mysql://user:password@host:port/db`
 * URL, over TLS that checks the server's certificate. The URL can't turn that
 * off: given a URL, mysql2 would let a `?ssl=` in it override this.
 */
export function productionConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 4000),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ssl: { ...CHECKED_TLS },
  };
}

/**
 * The migration login, from TIDB_MIGRATION_URL. Nobody on the team has
 * Cloudflare access (spec.md:99), so a "Migrate production" workflow can't be
 * the thing that sets it: Adam runs db:migrate from his laptop until that
 * workflow exists (spec.md:51), passing --env-file to name the file
 * create-logins.ts saved.
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
