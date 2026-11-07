/**
 * Fails if tracked Markdown holds an em or en dash, which our writing rules ban
 * (.agents/skills/unslop/SKILL.md, rule 13). Run from CI, or with:
 *
 *   pnpm check:dashes
 *
 * It leaves out what we don't write ourselves: skills copied in from elsewhere,
 * and meeting notes and answers, which quote people as they spoke.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NOT_OURS = [".agents/skills/", ".scratch/meeting-notes/", ".scratch/key-questions/"];
const DASHES = /[–—]/;

const root = resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "-z", "*.md"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((file) => file !== "" && !NOT_OURS.some((prefix) => file.startsWith(prefix)));

let found = 0;
for (const file of files) {
  readFileSync(resolve(root, file), "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (DASHES.test(line)) {
        console.error(`${file}:${index + 1}: use a comma, colon, full stop or brackets`);
        found++;
      }
    });
}

if (found > 0) {
  console.error(`${found} lines with an em or en dash.`);
  process.exit(1);
}
console.log(`${files.length} Markdown files have no em or en dash.`);
