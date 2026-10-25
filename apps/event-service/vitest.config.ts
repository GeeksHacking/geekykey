import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Every test runs on Node, as the server does, against the tests' own database
// in the TiDB from `mise run db:up`.
export default defineConfig({
  resolve: {
    // The Event screens' own imports, which start `@/` for their src/. The station board's
    // test reads its answer with the screens' schema (src/event/admin-routes.test.ts).
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("../event-web/src/", import.meta.url)) },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // Brings geekykey_test up to date once per run, before any test file.
    globalSetup: ["./test-support/global-setup.ts"],
    // Empties every table in geekykey_test before each test.
    setupFiles: ["./test-support/empty-tables.ts"],
    // One file at a time: they share one TiDB, and a file emptying the tables
    // mustn't pull the rows out from under another.
    fileParallelism: false,
  },
});
