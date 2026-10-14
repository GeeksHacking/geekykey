import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { jsonSchemaFiles } from "./json-schema.ts";

const dir = join(import.meta.dirname, "../json-schema");

test("json-schema/ holds what the schemas say, so other teams never get an old one", () => {
  const files = jsonSchemaFiles();
  assert.deepEqual(readdirSync(dir).sort(), Object.keys(files).sort());
  for (const [name, contents] of Object.entries(files)) {
    assert.equal(
      readFileSync(join(dir, name), "utf8"),
      contents,
      `${name} is out of date: run \`pnpm --filter @geekykey/handoff json-schema\``,
    );
  }
});

test("the request's JSON Schema keeps the agreement's rules", () => {
  const schema = JSON.parse(jsonSchemaFiles()["taps-request.schema.json"]!);
  assert.equal(schema.properties.taps.minItems, 1);
  assert.equal(schema.properties.taps.maxItems, 500);
  assert.deepEqual(schema.required, ["station_id", "taps"]);
});

test("a field added later doesn't break a team checking with an older JSON Schema", () => {
  // Fields are only ever added (the agreement's section 1), so none may be refused.
  for (const contents of Object.values(jsonSchemaFiles())) {
    assert.doesNotMatch(contents, /"additionalProperties": false/);
  }
});
