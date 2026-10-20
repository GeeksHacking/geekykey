import { defineConfig } from "vitest/config";

// The Worker's tests, apart from the screens' own (../vitest.config.ts). They run on Node and
// start the Worker with Wrangler's test harness, which runs it on workerd, the runtime
// Cloudflare runs, from ../wrangler.jsonc and the screens' build in ../dist.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["**/*.test.ts"],
    environment: "node",
    // Starting workerd takes a few seconds.
    hookTimeout: 30_000,
  },
});
