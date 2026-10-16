import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { unstable_readConfig } from "wrangler";
import { defineConfig } from "vitest/config";

// The settings under `vars` in wrangler.jsonc. Passed again below, because
// the plugin also reads your .dev.vars, which would otherwise replace them
// with your local ones, and the tests would pass or fail by what's in it.
const { vars } = unstable_readConfig({ config: "./wrangler.jsonc" });

// Every test runs inside workerd, the runtime the Worker runs on in
// production, with the settings in wrangler.jsonc. No test reaches the Event
// Service or the claims stand-in: each fakes them behind `fetch`
// (test-support/fake-services.ts).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ...vars,
          // The secrets the Worker can't start without, as stand-ins, since CI
          // has no .dev.vars. They're the ones the fakes check. Wrangler still
          // warns that they're missing, which is harmless.
          SESSION_SECRET: "test-session-secret-not-a-secret",
          CLAIMS_STAND_IN_KEY: "5".repeat(64),
          EVENT_SERVICE_KEY_SHOWCASE: "e".repeat(64),
        },
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
