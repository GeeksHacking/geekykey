import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { onTestFinished, test } from "vitest";

const backendDir = join(import.meta.dirname, "..");
// Oxlint's command line, run with this same Node, as check-migrations.ts runs drizzle-kit's.
const oxlint = join(
  dirname(createRequire(import.meta.url).resolve("oxlint/package.json")),
  "bin/oxlint",
);

/** A file under src/, one line of it, and whether Oxlint should pass that line there. */
type Case = [path: string, line: string, clean: boolean];

/** A line importing everything from `specifier`. */
const from = (specifier: string) => `export * from "${specifier}";`;

/**
 * Lints each case's line, alone in its file, with the backend's
 * .oxlintrc.json, and checks Oxlint passes or fails it as the case says. The
 * file is written at its path under src/ in a folder of its own, beside a
 * copy of the config, since the config's rules for each area are matched by
 * path.
 */
async function assertLints(cases: Case[]): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "geekykey-areas-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await copyFile(join(backendDir, ".oxlintrc.json"), join(dir, ".oxlintrc.json"));
  for (const [path, line, clean] of cases) {
    const file = join(dir, "src", path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${line}\n`);
    const passed = await promisify(execFile)(process.execPath, [oxlint, "--deny-warnings", file], {
      cwd: dir,
    }).then(
      () => true,
      () => false,
    );
    assert.equal(passed, clean, `${path}: ${line}`);
  }
}

test("neither area imports the other, not even its schema", async () => {
  await assertLints([
    ["event/handoff-routes.ts", from("../claims-stand-in/routes.ts"), false],
    ["event/handoff-routes.ts", from("../claims-stand-in/schema.ts"), false],
    ["claims-stand-in/routes.ts", from("../event/tap-pipeline.ts"), false],
    ["claims-stand-in/routes.ts", from("../event/schema.ts"), false],
  ]);
});

test("an area takes only types from the server's root, which brings in every area", async () => {
  await assertLints([
    [
      "event/me-routes.ts",
      'import type { AppEnv } from "../app.ts"; export type Env = AppEnv;',
      true,
    ],
    [
      "event/me-routes.ts",
      'import { createApp } from "../app.ts"; export const app = createApp;',
      false,
    ],
    [
      "claims-stand-in/routes.ts",
      'import { testDb } from "../test-helpers.ts"; export const db = testDb;',
      false,
    ],
  ]);
});

test("an area may import itself and the shared code", async () => {
  await assertLints([
    ["event/tap-pipeline.ts", from("./schema.ts"), true],
    ["event/tap-pipeline.ts", from("../db/pool.ts"), true],
    ["event/handoff-routes.ts", from("../lib/log.ts"), true],
    ["event/handoff-routes.ts", from("@geekykey/handoff"), true],
    ["claims-stand-in/routes.ts", from("./schema.ts"), true],
  ]);
});

test("the base imports no game, and not the showcase's settings", async () => {
  // The base is what the GitHub template copies, so it works with whatever games an event adds.
  await assertLints([
    ["event/tap-pipeline.ts", from("../games/passport/passport.ts"), false],
    ["event/handoff-routes.ts", from("../showcase/games.ts"), false],
    ["event/tap-pipeline.test.ts", from("../games/passport/passport.ts"), false],
    ["event/tap-pipeline.test.ts", from("../showcase/games.ts"), false],
  ]);
});

test("a game may import the base, and the showcase's settings may import the games", async () => {
  await assertLints([
    ["games/passport/passport.ts", from("../../event/games.ts"), true],
    ["games/passport/passport.ts", from("../../event/schema.ts"), true],
    ["showcase/games.ts", from("../games/passport/passport.ts"), true],
    ["showcase/games.ts", from("../event/games.ts"), true],
  ]);
});

test("the games and the showcase's settings are the Event side, apart from the claims stand-in", async () => {
  await assertLints([
    ["games/passport/passport.ts", from("../../claims-stand-in/schema.ts"), false],
    ["showcase/games.ts", from("../claims-stand-in/routes.ts"), false],
    [
      "games/passport/passport.ts",
      'import { createApp } from "../../app.ts"; export const a = createApp;',
      false,
    ],
    ["claims-stand-in/routes.ts", from("../games/passport/passport.ts"), false],
    ["claims-stand-in/routes.ts", from("../showcase/games.ts"), false],
  ]);
});

test("a test may use the whole server and read the other area's tables, and nothing else of it", async () => {
  // The two areas are one server, and a test sees what a request left in the database.
  await assertLints([
    ["event/me-routes.test.ts", from("../claims-stand-in/schema.ts"), true],
    ["claims-stand-in/routes.test.ts", from("../event/schema.ts"), true],
    [
      "claims-stand-in/routes.test.ts",
      'import { testApp } from "../test-helpers.ts"; export const app = testApp;',
      true,
    ],
    ["event/me-routes.test.ts", from("../claims-stand-in/routes.ts"), false],
    ["claims-stand-in/routes.test.ts", from("../event/tap-pipeline.ts"), false],
    ["claims-stand-in/routes.test.ts", from("../games/passport/passport.ts"), false],
    ["claims-stand-in/routes.test.ts", from("../showcase/games.ts"), false],
  ]);
});
