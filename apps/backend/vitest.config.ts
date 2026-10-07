import { createRequire, isBuiltin } from "node:module";
import { join } from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import type { Plugin } from "vitest/config";
import { defineConfig } from "vitest/config";
import { localDatabaseUrl } from "./scripts/local-tidb.ts";

const nodeProcessStandIn = join(import.meta.dirname, "test-support/node-process.cjs");

/**
 * Fixes two ways the Vitest plugin loads mysql2 wrongly (seen with
 * @cloudflare/vitest-plugin 1.3.1, and still there in 1.3.3). Only the tests
 * need this: `wrangler dev` and deploys bundle the Worker with esbuild, which
 * gets both right.
 *
 * - mysql2 `require()`s packages such as lru.min and sql-escaper that ship an
 *   ES module build beside their CommonJS one. The plugin asks for a
 *   `require()`, but Vite hands back the ES module build, and mysql2 gets
 *   `undefined` from it. This resolves those the way Node does instead.
 * - The plugin's list of workerd's built-in modules leaves out node:process,
 *   so a `require()` of it fails. This hands back the global `process`.
 *
 * The "Failed to require ... cardinal" warning in every run is harmless:
 * mysql2 tries that optional package and carries on without it.
 *
 * It goes in the root config, not the "worker" project: the plugin resolves
 * those `require()`s through Vitest's root server, which never sees a
 * project's plugins.
 */
const requireLikeNode: Plugin = {
  name: "geekykey:require-like-node",
  enforce: "pre",
  resolveId(source, importer, options) {
    const isRequire = options.custom?.["node-resolve"]?.isRequire === true;
    if (!isRequire || importer === undefined) return null;
    if (source === "process" || source === "node:process") {
      return nodeProcessStandIn;
    }
    const isPackage = !source.startsWith(".") && !source.startsWith("/");
    if (!isPackage || isBuiltin(source)) return null;
    // The plugin can tag the importer's path with a query string.
    const importerPath = importer.split("?")[0]!;
    try {
      return createRequire(importerPath).resolve(source);
    } catch {
      return null;
    }
  },
};

// Two sets of tests, both against the TiDB from `mise run db:up`.
export default defineConfig({
  plugins: [requireLikeNode],
  test: {
    projects: [
      {
        // The Worker's tests run inside workerd, the runtime the Worker runs on
        // in production, with the bindings from wrangler.jsonc plus the
        // overrides below.
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              // The tests' own database, so running them never touches the data in
              // geekykey_dev that `wrangler dev` uses.
              hyperdrives: {
                HYPERDRIVE: localDatabaseUrl("geekykey_test"),
              },
              // Dev-login on, as `mise run dev:backend` has it: the tests sign in
              // through it, and CI has no .dev.vars. It also means the Worker
              // signs sessions with a stand-in, so the "Missing required
              // secrets: SESSION_SECRET" warning for every test file is harmless.
              bindings: { DEV_AUTH_ENABLED: "true" },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["src/**/*.test.ts"],
          // Brings geekykey_test up to date once per run, on Node.
          globalSetup: ["./test-support/global-setup.ts"],
          // Empties every table before each test, inside workerd.
          setupFiles: ["./test-support/empty-tables.ts"],
        },
      },
      {
        // The database scripts' tests run on Node, as the scripts do, and
        // connect straight to TiDB with mysql2.
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
    // One file at a time, across both sets: they share one TiDB, and a file
    // emptying the tables mustn't pull the rows out from under another.
    fileParallelism: false,
  },
});
