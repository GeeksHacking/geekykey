/**
 * Fails if the changelog lost a line that the base branch has. The site's build can't see this:
 * a line deleted by a bad conflict resolution leaves a valid file, and `/changelog#<id>` links
 * break without a word. Run from CI on each pull request:
 *
 *   node apps/updates/scripts/check-changelog-ids.ts <base-ref>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CHANGELOG = "apps/updates/src/content/changelog.yaml";
const root = resolve(import.meta.dirname, "../../..");

const base = process.argv[2];
if (!base) {
  console.error("Usage: node apps/updates/scripts/check-changelog-ids.ts <base-ref>");
  process.exit(2);
}

const idsIn = (yaml: string) => new Set(Array.from(yaml.matchAll(/^- id: (\S+)/gm), (m) => m[1]));

const before = idsIn(
  execFileSync("git", ["show", `${base}:${CHANGELOG}`], { cwd: root, encoding: "utf8" }),
);
const after = idsIn(readFileSync(resolve(root, CHANGELOG), "utf8"));
const lost = [...before].filter((id) => !after.has(id));

if (lost.length > 0) {
  console.error(
    `${CHANGELOG} has lost ${lost.length} line(s) that ${base} has:\n\n` +
      lost.map((id) => `  ${id}`).join("\n") +
      `\n\nPut them back. A rebase that resolved a conflict by hand is the usual cause.`,
  );
  process.exit(1);
}
console.log(`${CHANGELOG} keeps all ${before.size} lines from ${base}.`);
