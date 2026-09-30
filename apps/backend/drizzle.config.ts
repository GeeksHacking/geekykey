import { defineConfig } from "drizzle-kit";

// Only `generate` is used, and it needs no database. `mise run db:migrate`
// applies the migrations it writes (src/db/migrate.ts).
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
