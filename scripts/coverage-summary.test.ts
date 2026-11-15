import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageTable } from "./coverage-summary.ts";

function counts(total: number, covered: number) {
  return { total, covered, skipped: 0, pct: total === 0 ? 100 : (covered / total) * 100 };
}

function file(lines: [number, number], branches: [number, number], functions: [number, number]) {
  return {
    lines: counts(...lines),
    statements: counts(...lines),
    functions: counts(...functions),
    branches: counts(...branches),
  };
}

test("an app with no folders named gets one row from its total", () => {
  const summary = {
    total: file([3779, 3405], [3001, 2646], [1389, 1259]),
    "/repo/apps/event-web/src/app.tsx": file([10, 5], [4, 2], [2, 1]),
  };

  assert.equal(
    coverageTable("Event web", summary, "/repo/apps/event-web", []),
    [
      "### Event web coverage",
      "",
      "| Files | Lines | Branches | Functions |",
      "| --- | --- | --- | --- |",
      "| All | 90.10% (3405 of 3779) | 88.17% (2646 of 3001) | 90.64% (1259 of 1389) |",
      "",
    ].join("\n"),
  );
});

test("each folder named gets its own row, summed from the files under it", () => {
  const summary = {
    total: file([40, 25], [14, 8], [9, 6]),
    "/repo/apps/event-service/src/app.ts": file([10, 9], [4, 3], [2, 2]),
    "/repo/apps/event-service/src/games/dice.ts": file([10, 7], [2, 1], [3, 2]),
    "/repo/apps/event-service/scripts/seed.ts": file([20, 9], [8, 4], [4, 2]),
  };

  assert.equal(
    coverageTable("Event Service", summary, "/repo/apps/event-service", ["src/", "scripts/"]),
    [
      "### Event Service coverage",
      "",
      "| Files | Lines | Branches | Functions |",
      "| --- | --- | --- | --- |",
      "| `src/` | 80.00% (16 of 20) | 66.67% (4 of 6) | 80.00% (4 of 5) |",
      "| `scripts/` | 45.00% (9 of 20) | 50.00% (4 of 8) | 50.00% (2 of 4) |",
      "",
    ].join("\n"),
  );
});

test("a count with nothing to cover says so rather than giving a percentage", () => {
  const summary = { total: file([5, 5], [0, 0], [1, 1]) };

  assert.match(
    coverageTable("Tiny", summary, "/repo/apps/tiny", []),
    /\| All \| 100\.00% \(5 of 5\) \| none \| 100\.00% \(1 of 1\) \|/,
  );
});

test("a folder named without its slash still leaves out a sibling that starts the same", () => {
  const summary = {
    total: file([20, 15], [0, 0], [2, 2]),
    "/repo/apps/tiny/src/app.ts": file([10, 10], [0, 0], [1, 1]),
    "/repo/apps/tiny/src-old/app.ts": file([10, 5], [0, 0], [1, 1]),
  };

  assert.match(
    coverageTable("Tiny", summary, "/repo/apps/tiny", ["src"]),
    /\| `src` \| 100\.00% \(10 of 10\) \| none \| 100\.00% \(1 of 1\) \|/,
  );
});
