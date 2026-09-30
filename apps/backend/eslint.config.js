import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // `wrangler types` writes worker-configuration.d.ts, and `wrangler dev` builds into .wrangler.
  { ignores: [".wrangler", "worker-configuration.d.ts"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
]);
