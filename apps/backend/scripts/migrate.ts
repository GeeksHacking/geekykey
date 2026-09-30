/**
 * Brings both local databases up to date with the migrations in drizzle/.
 * `mise run db:up` and `db:reset` run it after create-databases.ts, and
 * `mise run db:migrate` runs it on its own after a new migration.
 */
import { migrate } from "../src/db/migrate.ts";
import { LOCAL_DATABASES, localDatabaseUrl } from "./local-tidb.ts";

for (const name of LOCAL_DATABASES) {
  await migrate(localDatabaseUrl(name));
  console.log(`${name} is migrated`);
}
