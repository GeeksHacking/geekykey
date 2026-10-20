import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["dist", "coverage", "src/routeTree.gen.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // Route files export a Route object, and shadcn files export variant helpers.
    // Neither is a component, and both are fine for Fast Refresh in practice.
    files: ["src/routes/**/*.tsx", "src/components/ui/*.tsx", "src/test/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);
