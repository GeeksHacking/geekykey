import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Connection, createConnection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, test } from "vitest";
import { LOCAL_ROOT } from "./local-tidb.ts";

const backendDir = join(import.meta.dirname, "..");

// A database in the Docker TiDB playing production, so a test can see whether
// the script migrated it.
const STAND_IN = "geekykey_production_stand_in";
const STAND_IN_URL = `mysql://root@${LOCAL_ROOT.host}:${LOCAL_ROOT.port}/${STAND_IN}`;

let root: Connection;

beforeAll(async () => {
  root = await createConnection(LOCAL_ROOT);
});

afterAll(async () => {
  await root.query(`DROP DATABASE IF EXISTS ${STAND_IN}`);
  await root.end();
});

beforeEach(async () => {
  await root.query(`DROP DATABASE IF EXISTS ${STAND_IN}`);
  await root.query(`CREATE DATABASE ${STAND_IN}`);
});

/** Runs this script, as `pnpm db:migrate` does, with these arguments and extra environment variables. */
async function dbMigrate(args: string[], env: Record<string, string> = {}) {
  return promisify(execFile)(process.execPath, ["scripts/migrate.ts", ...args], {
    cwd: backendDir,
    env: { ...process.env, ...env },
  });
}

async function standInTables(): Promise<unknown[]> {
  const [rows] = await root.query(`SHOW TABLES FROM ${STAND_IN}`);
  return rows as unknown[];
}

test("with no option, it migrates the two local databases and nothing else, even with a production login set", async () => {
  const { stdout } = await dbMigrate([], { TIDB_MIGRATION_URL: STAND_IN_URL });

  assert.equal(stdout, "geekykey_dev is migrated\ngeekykey_test is migrated\n");
  assert.deepEqual(await standInTables(), []);
});

test("--production with no production login set fails, and says which variable to set", async () => {
  const env = { ...process.env };
  delete env.TIDB_MIGRATION_URL;

  await assert.rejects(
    promisify(execFile)(process.execPath, ["scripts/migrate.ts", "--production"], {
      cwd: backendDir,
      env,
    }),
    (error: { stderr: string }) => error.stderr.includes("TIDB_MIGRATION_URL"),
  );
});

test("--production reads the login from --env-file, and won't migrate without TLS, even when the URL says ssl=false", async () => {
  // The Docker TiDB doesn't offer TLS at all.
  const dir = await mkdtemp(join(tmpdir(), "geekykey-migrate-"));
  const envFile = join(dir, "tidb-migration.env");
  await writeFile(envFile, `TIDB_MIGRATION_URL=${STAND_IN_URL}?ssl=false\n`);
  try {
    await assert.rejects(
      dbMigrate(["--production", "--env-file", envFile]),
      (error: { stderr: string }) => error.stderr.includes("HANDSHAKE_NO_SSL_SUPPORT"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  assert.deepEqual(await standInTables(), []);
});

test("--env-file wins over a production login left set in the shell", async () => {
  const dir = await mkdtemp(join(tmpdir(), "geekykey-migrate-"));
  const envFile = join(dir, "tidb-migration.env");
  await writeFile(envFile, `TIDB_MIGRATION_URL=${STAND_IN_URL}\n`);
  try {
    // Reaching the Docker TiDB, which then refuses TLS, shows the file's
    // login was used, not the shell's, whose host doesn't exist.
    await assert.rejects(
      dbMigrate(["--production", "--env-file", envFile], {
        TIDB_MIGRATION_URL: "mysql://someone@stale.invalid:4000/geekykey",
      }),
      (error: { stderr: string }) => error.stderr.includes("HANDSHAKE_NO_SSL_SUPPORT"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
