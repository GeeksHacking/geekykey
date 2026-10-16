import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { type Connection, createConnection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, test } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { LOCAL_ROOT } from "./local-tidb.ts";
import { ensureLogins, loginNames, PRODUCTION, STAGING } from "./logins.ts";

// The Docker TiDB stands in for GeeksHacking's cluster. Its root login has no
// user-name prefix, so the logins are plain geekykey_app and geekykey_migrate,
// and staging's geekykey_stg_app and geekykey_stg_mig.
let root: Connection;
let configDir: string;
let savePath: string;

beforeAll(async () => {
  root = await createConnection(LOCAL_ROOT);
});

afterAll(async () => {
  await root.end();
});

// Every test starts from a cluster that has never seen the script.
beforeEach(async () => {
  await root.query(
    "DROP USER IF EXISTS 'geekykey_app'@'%', 'geekykey_migrate'@'%', " +
      "'geekykey_stg_app'@'%', 'geekykey_stg_mig'@'%', 'not_quite_root'@'%'",
  );
  await root.query("DROP DATABASE IF EXISTS geekykey");
  await root.query("DROP DATABASE IF EXISTS geekykey_staging");
  configDir = await mkdtemp(join(tmpdir(), "geekykey-logins-"));
  savePath = join(configDir, "tidb-migration.env");
  return () => rm(configDir, { recursive: true, force: true });
});

async function savedMigrationUrl(path = savePath): Promise<string> {
  const url = parseEnv(await readFile(path, "utf8")).TIDB_MIGRATION_URL;
  assert.ok(url, "the saved file holds TIDB_MIGRATION_URL");
  return url;
}

test("the migration login runs today's migrations, and the app login reads and writes rows but can't create a table", async () => {
  const { appUrl } = await ensureLogins(root, { savePath, newAppPassword: true });
  assert.ok(appUrl);

  await migrate(await savedMigrationUrl());

  const app = await createConnection(appUrl);
  try {
    await app.query(
      "INSERT INTO users (id, display_name, created_at) VALUES ('user-1', 'Alex', '2026-10-01T00:00:00.000Z')",
    );
    const [rows] = await app.query("SELECT display_name FROM users WHERE id = 'user-1'");
    assert.deepEqual(rows, [{ display_name: "Alex" }]);

    await assert.rejects(app.query("CREATE TABLE extra (id INT PRIMARY KEY)"), {
      code: "ER_TABLEACCESS_DENIED_ERROR",
    });
  } finally {
    await app.end();
  }
});

test("running it again changes no password, and leaves the saved migration login alone", async () => {
  const { appUrl } = await ensureLogins(root, { savePath, newAppPassword: true });
  assert.ok(appUrl);
  const saved = await readFile(savePath, "utf8");

  await ensureLogins(root, { savePath });

  assert.equal(await readFile(savePath, "utf8"), saved);
  const migration = await createConnection(await savedMigrationUrl());
  await migration.end();
  const app = await createConnection(appUrl);
  await app.end();
});

test("a new app password replaces the old one, which stops working", async () => {
  const first = await ensureLogins(root, { savePath, newAppPassword: true });
  const saved = await readFile(savePath, "utf8");

  const second = await ensureLogins(root, { savePath, newAppPassword: true });

  assert.ok(first.appUrl && second.appUrl);
  assert.notEqual(second.appUrl, first.appUrl);
  await assert.rejects(createConnection(first.appUrl), { code: "ER_ACCESS_DENIED_ERROR" });
  const app = await createConnection(second.appUrl);
  await app.end();
  assert.equal(await readFile(savePath, "utf8"), saved, "the migration login is left alone");
});

test("stops before changing anything when the migration login exists but its saved copy is gone", async () => {
  const { appUrl } = await ensureLogins(root, { savePath, newAppPassword: true });
  assert.ok(appUrl);
  const migrationUrl = await savedMigrationUrl();
  await rm(savePath);

  await assert.rejects(
    ensureLogins(root, { savePath, newAppPassword: true }),
    /--new-migration-password/,
  );

  const migration = await createConnection(migrationUrl);
  await migration.end();
  const app = await createConnection(appUrl);
  await app.end();
});

test("a new migration password replaces the old one, and is saved", async () => {
  await ensureLogins(root, { savePath });
  const oldUrl = await savedMigrationUrl();
  await rm(savePath);

  await ensureLogins(root, { savePath, newMigrationPassword: true });

  const newUrl = await savedMigrationUrl();
  assert.notEqual(newUrl, oldUrl);
  await assert.rejects(createConnection(oldUrl), { code: "ER_ACCESS_DENIED_ERROR" });
  const migration = await createConnection(newUrl);
  await migration.end();
});

test("on a new cluster, it replaces the old saved login with one only its owner can read", async () => {
  await writeFile(savePath, "TIDB_MIGRATION_URL=mysql://from-a-lost-cluster\n", { mode: 0o644 });

  await ensureLogins(root, { savePath });

  assert.equal((await stat(savePath)).mode & 0o777, 0o600);
  const migration = await createConnection(await savedMigrationUrl());
  await migration.end();
});

// TiDB Cloud's own example of a prefix, from its docs.
test("the logins carry the user-name prefix of TiDB Cloud's root login", () => {
  assert.deepEqual(loginNames("3pTAoNNegb47Uc8.root"), {
    app: "3pTAoNNegb47Uc8.geekykey_app",
    migration: "3pTAoNNegb47Uc8.geekykey_migrate",
  });
});

test("staging's logins carry the prefix too, and fit under TiDB's 32-character limit", () => {
  assert.deepEqual(loginNames("3pTAoNNegb47Uc8.root", STAGING), {
    app: "3pTAoNNegb47Uc8.geekykey_stg_app",
    migration: "3pTAoNNegb47Uc8.geekykey_stg_mig",
  });
});

test("staging's logins work only in geekykey_staging, and production's only in geekykey", async () => {
  const stagingSavePath = join(configDir, "tidb-staging-migration.env");
  const production = await ensureLogins(root, { savePath, newAppPassword: true });
  const staging = await ensureLogins(root, {
    savePath: stagingSavePath,
    newAppPassword: true,
    target: STAGING,
  });
  assert.ok(production.appUrl && staging.appUrl);
  assert.equal(new URL(staging.appUrl).pathname, "/geekykey_staging");
  assert.equal(new URL(await savedMigrationUrl(stagingSavePath)).pathname, "/geekykey_staging");
  await migrate(await savedMigrationUrl());
  await migrate(await savedMigrationUrl(stagingSavePath));

  const logins = [
    { url: staging.appUrl, other: PRODUCTION.database },
    { url: await savedMigrationUrl(stagingSavePath), other: PRODUCTION.database },
    { url: production.appUrl, other: STAGING.database },
    { url: await savedMigrationUrl(), other: STAGING.database },
  ];
  for (const { url, other } of logins) {
    const login = await createConnection(url);
    try {
      await login.query("SELECT COUNT(*) FROM users");
      await assert.rejects(login.query(`SELECT COUNT(*) FROM ${other}.users`), {
        code: "ER_TABLEACCESS_DENIED_ERROR",
      });
    } finally {
      await login.end();
    }
  }
});

test("a prefix that leaves no room for the names under TiDB's 32-character limit is refused", () => {
  assert.throws(() => loginNames("3pTAoNNegb47Uc8X.root"), /32 characters/);
});

test("the refusal names the login that's too long", () => {
  const longApp = { ...PRODUCTION, app: "geekykey_app_with_a_long_name" };
  assert.throws(
    () => loginNames("3pTAoNNegb47Uc8.root", longApp),
    /^Error: 3pTAoNNegb47Uc8\.geekykey_app_with_a_long_name is longer/,
  );
});

test("when a new migration password can't be set, the saved login still works", async () => {
  await ensureLogins(root, { savePath });
  const saved = await readFile(savePath, "utf8");
  // A login that can do all the script needs except change passwords.
  await root.query("CREATE USER 'not_quite_root'@'%' IDENTIFIED BY 'not_quite_root'");
  await root.query("GRANT SELECT ON mysql.user TO 'not_quite_root'@'%'");
  await root.query("GRANT CREATE ON geekykey.* TO 'not_quite_root'@'%'");
  const notQuiteRoot = await createConnection({
    ...LOCAL_ROOT,
    user: "not_quite_root",
    password: "not_quite_root",
  });

  try {
    await assert.rejects(ensureLogins(notQuiteRoot, { savePath, newMigrationPassword: true }));
  } finally {
    await notQuiteRoot.end();
  }

  assert.equal(await readFile(savePath, "utf8"), saved);
  const migration = await createConnection(await savedMigrationUrl());
  await migration.end();
});
