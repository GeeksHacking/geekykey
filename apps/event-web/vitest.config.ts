import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // `pnpm test:coverage`, which CI runs. Reported, never a threshold (FRO-188).
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // The mock API the dev server and the tests run on. It's test support,
        // never what a person meets on the deployed screens.
        "src/api/mock/**",
        // The tests' own helpers (src/test/setup.ts and the rest, and any
        // *-test-helpers.ts beside the tests that use it), also test support.
        "src/test/**",
        "src/**/*-test-helpers.ts",
        // Only in `pnpm dev` (import.meta.env.DEV): a build leaves it out.
        "src/features/auth/dev-login-form.tsx",
        // The entry points that mount the app, and the avatar lab, in a
        // browser. Unit tests render the app themselves, and the browser tests
        // (e2e/) load the app's.
        "src/**/main.tsx",
        // The avatar's 3D drawing in WebGL. Screenshots (`pnpm shot`) check it,
        // and a unit test of its output would prove little.
        "src/features/passport/avatar/voxel-world.ts",
        "src/features/passport/avatar/sticker-3d.ts",
        "src/features/passport/avatar/confetti.tsx",
      ],
      // `json-summary` is what scripts/coverage-summary.ts reads for CI's job summary.
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
});
