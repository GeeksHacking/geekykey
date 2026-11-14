import { defineConfig } from "drizzle-kit";

// Only `generate` is used, and it needs no database. `mise run db:migrate`
// applies the migrations it writes (src/db/migrate.ts).
export default defineConfig({
  dialect: "mysql",
  schema: [
    "./src/event/schema.ts",
    "./src/games/connections/schema.ts",
    "./src/games/team-duels/schema.ts",
    "./src/games/relay/schema.ts",
    "./src/games/open-seat/schema.ts",
    "./src/claims-stand-in/schema.ts",
  ],
  out: "./drizzle",
});
