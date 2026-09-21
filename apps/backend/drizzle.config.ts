import { defineConfig } from "drizzle-kit";

// Only `generate` is used: migrations are applied at startup by the runtime migrator.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
