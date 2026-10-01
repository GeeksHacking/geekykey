/**
 * Brings databases up to date with the migrations in drizzle/.
 *
 * With no option, it migrates the two local databases. `mise run db:up` and
 * `db:reset` run it after create-databases.ts, and `mise run db:migrate` runs
 * it on its own after a new migration.
 *
 * With --production, it migrates GeeksHacking's cluster instead, and nothing
 * else, with the migration login in TIDB_MIGRATION_URL. On Adam's laptop,
 * --env-file reads that from the file create-logins.ts saved:
 *
 *   mise run db:migrate -- --production --env-file ~/.config/geekykey/tidb-migration.env
 */
import { parseArgs } from "node:util";
import { migrate } from "../src/db/migrate.ts";
import { LOCAL_DATABASES, localDatabaseUrl } from "./local-tidb.ts";
import { migrationLogin } from "./production-tidb.ts";

const { values } = parseArgs({
  options: {
    production: { type: "boolean", default: false },
    "env-file": { type: "string" },
  },
});

if (values.production) {
  await migrate(migrationLogin(values["env-file"]));
  console.log("geekykey on GeeksHacking's TiDB is migrated");
} else {
  for (const name of LOCAL_DATABASES) {
    await migrate(localDatabaseUrl(name));
    console.log(`${name} is migrated`);
  }
}
