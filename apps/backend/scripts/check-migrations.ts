/**
 * Fails when src/db/schema.ts has a change that no migration in drizzle/
 * covers. CI runs it on every pull request, and anyone can run it with
 * `pnpm --filter @geekykey/backend check:migrations`.
 *
 * It runs `drizzle-kit generate` and passes only when that says there is
 * nothing to write, and wrote nothing. drizzle-kit's exit code is no help:
 * when it needs to ask whether a column was renamed, it can't ask without a
 * terminal, and this script gives it none, so it prints an error, writes
 * nothing, and still exits 0.
 *
 * When it fails, it has usually just written the missing migration into
 * drizzle/: look it over and commit it. After a rename it writes nothing, so
 * run `pnpm --filter @geekykey/backend db:generate` in a terminal, where
 * drizzle-kit can ask.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const backendDir = join(import.meta.dirname, "..");
const migrationsDir = join(backendDir, "drizzle");

// drizzle-kit's command line sits beside its main module. Running it with this
// same Node works the same everywhere, with or without pnpm putting it on PATH.
const drizzleKit = join(dirname(createRequire(import.meta.url).resolve("drizzle-kit")), "bin.cjs");

const generate = spawnSync(process.execPath, [drizzleKit, "generate"], {
  cwd: backendDir,
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});
process.stdout.write(generate.stdout ?? "");
process.stderr.write(generate.stderr ?? "");

const output = `${generate.stdout ?? ""}${generate.stderr ?? ""}`;
const saidNothingToDo = output.includes("No schema changes, nothing to migrate");
const changed = execFileSync("git", ["status", "--porcelain", "--", migrationsDir], {
  encoding: "utf8",
});

if (generate.status !== 0 || !saidNothingToDo || changed !== "") {
  if (changed !== "") console.error(`\nChanged in drizzle/:\n${changed}`);
  console.error(
    "drizzle-kit generate failed, or found a schema change with no migration. " +
      "Commit the migration it wrote, or run `pnpm --filter @geekykey/backend db:generate` " +
      "in a terminal and commit what it writes.",
  );
  process.exit(1);
}
