/**
 * Creates the geekykey database on GeeksHacking's TiDB cluster, and the two
 * logins the backend reaches it with (logins.ts says what each may do). Adam
 * runs it from his laptop, because it needs the cluster's root login:
 *
 *   cd apps/backend
 *   mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env
 *
 * It saves the migration login to ~/.config/geekykey/tidb-migration.env,
 * readable only by you, for `db:migrate --production`. The app login's
 * password is saved nowhere, and shown only when asked for.
 *
 * Running it again changes nothing that already exists. On a new cluster, such
 * as one restored after the old one is lost, it creates everything again.
 *
 *   --new-app-password        give the app login a new password, and show the
 *                             login once, for DATABASE_URL in Secret Manager.
 *                             Use it at the first deploy, or if it ever leaks.
 *   --new-migration-password  give the migration login a new password, and
 *                             save that. Then add it to Secret Manager as a
 *                             new version, as infra/README.md says.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createConnection } from "mysql2/promise";
import { DATABASE, ensureLogins, loginNames } from "./logins.ts";
import { rootLogin } from "./production-tidb.ts";

const SAVE_PATH = join(homedir(), ".config", "geekykey", "tidb-migration.env");

const { values } = parseArgs({
  options: {
    "env-file": { type: "string" },
    "new-app-password": { type: "boolean", default: false },
    "new-migration-password": { type: "boolean", default: false },
  },
});

const root = await createConnection(rootLogin(values["env-file"]));
try {
  const { appUrl } = await ensureLogins(root, {
    savePath: SAVE_PATH,
    newAppPassword: values["new-app-password"],
    newMigrationPassword: values["new-migration-password"],
  });
  const names = loginNames(root.config.user ?? "");

  console.log(`Database:         ${DATABASE}`);
  console.log(`Migration login:  ${names.migration}, saved in ${SAVE_PATH}`);
  if (appUrl) {
    console.log(`App login:        ${appUrl}`);
    console.log("                  <- shown once, for DATABASE_URL. Save it nowhere else.");
  } else {
    console.log(`App login:        ${names.app}. Its password isn't shown: add`);
    console.log("                  --new-app-password when DATABASE_URL needs it.");
  }
} finally {
  await root.end();
}
