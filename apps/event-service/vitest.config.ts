import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { FailureLog } from "./test-support/failure-log.ts";

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
    reporters: ["default", new FailureLog()],
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // Stops the run if another is using geekykey_test, then brings it up to date.
    globalSetup: ["./test-support/global-setup.ts"],
    // Empties every table in geekykey_test before each test.
    setupFiles: ["./test-support/empty-tables.ts"],
    // One file at a time: they share one TiDB, and a file emptying the tables
    // mustn't pull the rows out from under another.
    fileParallelism: false,
  },
});
