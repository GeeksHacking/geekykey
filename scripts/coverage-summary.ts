import { appendFileSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/**
 * Writes one app's coverage totals as a Markdown table, for the CI job summary
 * (FRO-188). It reads the coverage-summary.json that Vitest's `json-summary`
 * reporter writes, and appends the table to $GITHUB_STEP_SUMMARY, or prints it
 * when that isn't set. Nothing here fails on a low figure: CI reports coverage
 * and doesn't gate on it.
 *
 *   node scripts/coverage-summary.ts "Event web" apps/event-web/coverage/coverage-summary.json
 *
 * Folders given after the summary file's path each get their own row instead of
 * the total:
 *
 *   node scripts/coverage-summary.ts "Event Service" apps/event-service/coverage/coverage-summary.json src/ scripts/
 */

interface Counts {
  total: number;
  covered: number;
}

interface FileCoverage {
  lines: Counts;
  branches: Counts;
  functions: Counts;
}

type CoverageSummary = Record<string, FileCoverage>;

function figure({ total, covered }: Counts): string {
  if (total === 0) return "none";
  return `${((covered / total) * 100).toFixed(2)}% (${covered} of ${total})`;
}

function row(name: string, coverage: FileCoverage): string {
  const { lines, branches, functions } = coverage;
  return `| ${name} | ${figure(lines)} | ${figure(branches)} | ${figure(functions)} |`;
}

function add(a: Counts, b: Counts): Counts {
  return { total: a.total + b.total, covered: a.covered + b.covered };
}

/** The files under one folder of the app, added together. */
function folderTotal(summary: CoverageSummary, appRoot: string, folder: string): FileCoverage {
  // With the slash, "src" can't also match a sibling such as src-old/.
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  const none = { total: 0, covered: 0 };
  let sum: FileCoverage = { lines: none, branches: none, functions: none };
  for (const [path, coverage] of Object.entries(summary)) {
    if (path === "total" || !relative(appRoot, path).startsWith(prefix)) continue;
    sum = {
      lines: add(sum.lines, coverage.lines),
      branches: add(sum.branches, coverage.branches),
      functions: add(sum.functions, coverage.functions),
    };
  }
  return sum;
}

/**
 * The table for one app. With no folders, one row from the app's total. With
 * folders (the Event Service's `src/` and `scripts/`), a row for each, since
 * one total would hide the application code behind the scripts run by hand.
 */
export function coverageTable(
  title: string,
  summary: CoverageSummary,
  appRoot: string,
  folders: string[],
): string {
  const rows =
    folders.length === 0
      ? [row("All", summary.total)]
      : folders.map((folder) => row(`\`${folder}\``, folderTotal(summary, appRoot, folder)));
  return [
    `### ${title} coverage`,
    "",
    "| Files | Lines | Branches | Functions |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const [title, summaryFile, ...folders] = process.argv.slice(2);
  if (!title || !summaryFile) {
    console.error(
      "Usage: node scripts/coverage-summary.ts <title> <coverage-summary.json> [folder/ ...]",
    );
    process.exit(1);
  }
  const path = resolve(summaryFile);
  const summary = JSON.parse(readFileSync(path, "utf8")) as CoverageSummary;
  // coverage-summary.json sits in <app>/coverage/, and its paths are absolute.
  const table = coverageTable(title, summary, dirname(dirname(path)), folders);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) appendFileSync(stepSummary, `${table}\n`);
  else console.log(table);
}
