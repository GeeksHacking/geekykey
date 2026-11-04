/**
 * Fails on an en or em dash anywhere in src/. CLAUDE.md's copy rule bans them in visible text, and
 * telling a visible string from a comment takes a parser, so this reads every line. It is a script
 * rather than a test because Vitest's cache can keep an old list of files. Runs as part of `pnpm lint`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// From code points, so this file has none of them and the formatter has nothing to rewrite.
const DASHES = [String.fromCodePoint(0x2013), String.fromCodePoint(0x2014)];
const appRoot = resolve(import.meta.dirname, "..");
const src = join(appRoot, "src");

const found: string[] = [];
for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
  const file = join(entry.parentPath, entry.name);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (DASHES.some((dash) => line.includes(dash))) {
        found.push(`  ${relative(appRoot, file)}:${i + 1}`);
      }
    });
}

if (found.length > 0) {
  console.error(
    `These lines have an en or em dash, which CLAUDE.md's copy rule bans. Use a comma, a colon, ` +
      `brackets or a full stop:\n\n${found.join("\n")}`,
  );
  process.exit(1);
}
