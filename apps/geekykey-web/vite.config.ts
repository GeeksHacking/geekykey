import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const backend = "http://localhost:8000";

/** Firebase's web config, under the three names the runbook's step 13 gives Julian. */
const FIREBASE_VARS = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"];

export default defineConfig(({ command, mode }) => {
  // A build that ships the live client needs Firebase's config, or the sign-in buttons are
  // dead on arrival. Workers Builds sets the variables and only Julian can see that build,
  // so a typo there has to fail the build rather than ship.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build" && ["1", "true"].includes(env.VITE_LIVE_API ?? "")) {
    const missing = FIREBASE_VARS.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(
        `A live build needs Firebase's config. Missing: ${missing.join(", ")}. ` +
          `Set them in the build, or leave VITE_LIVE_API unset to ship the mock client.`,
      );
    }
  }

  return {
    plugins: [
      // Must run before the React plugin so route files are transformed first. Tests sit next
      // to the routes they cover, so the router skips *.test.ts(x) rather than warn about them.
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routeFileIgnorePattern: "\\.test\\.tsx?$",
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5174,
      strictPort: true,
      // Same-origin in dev so the HttpOnly session cookie needs no CORS setup.
      proxy: {
        "/api": { target: backend, changeOrigin: false },
        "/auth": { target: backend, changeOrigin: false },
      },
    },
  };
});
