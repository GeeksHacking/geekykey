/**
 * Writes json-schema/ from the Zod schemas in src/, for other teams. Run it
 * with `pnpm json-schema` after changing a schema, and commit what it writes:
 * a test fails while the two differ.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemaFiles } from "../src/json-schema.ts";

const dir = join(import.meta.dirname, "../json-schema");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
for (const [name, contents] of Object.entries(jsonSchemaFiles())) {
  writeFileSync(join(dir, name), contents);
  console.log(`Wrote json-schema/${name}`);
}
