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

test("the answer's JSON Schema keeps the agreement's rules", () => {
  const schema = JSON.parse(jsonSchemaFiles()["taps-answer.schema.json"]!);
  // One result per tap, so as many as the request allows.
  assert.equal(schema.properties.results.minItems, 1);
  assert.equal(schema.properties.results.maxItems, 500);
  const result = schema.properties.results.items;
  assert.equal(result.properties.client_tap_id.minLength, 1);
  assert.equal(result.properties.client_tap_id.maxLength, 128);
  assert.deepEqual(result.required, ["client_tap_id", "status"]);
  // The station's two rows, each as much as a row of its screen shows.
  assert.equal(result.properties.lines.minItems, 1);
  assert.equal(result.properties.lines.maxItems, 2);
  assert.equal(result.properties.lines.items.pattern, "^[\\x20-\\x7E]{0,16}$");
  assert.equal(result.properties.complete.type, "boolean");
  // A countdown counts at most 99 seconds, so {s} fits the 2 characters its lines count it as.
  const countdown = result.properties.countdown;
  assert.deepEqual(countdown.required, ["seconds", "lines", "ending"]);
  assert.equal(countdown.properties.seconds.minimum, 1);
  assert.equal(countdown.properties.seconds.maximum, 99);
  const line = new RegExp(countdown.properties.lines.items.pattern);
  assert.match("3 in, {s}s left", line);
  assert.match(`${"x".repeat(14)}{s}`, line);
  assert.doesNotMatch(`${"x".repeat(15)}{s}`, line);
  assert.doesNotMatch("x".repeat(17), line);
  assert.equal(countdown.properties.ending.items.pattern, "^[\\x20-\\x7E]{0,16}$");
});

test("the registered stations' JSON Schema keeps the agreement's rules", () => {
  const schema = JSON.parse(jsonSchemaFiles()["stations-answer.schema.json"]!);
  const station = schema.properties.stations.items;
  // Optional, and as a result's lines are.
  assert.deepEqual(station.required, ["station_id", "key_hash"]);
  assert.equal(station.properties.idle_lines.maxItems, 2);
  assert.equal(station.properties.idle_lines.items.pattern, "^[\\x20-\\x7E]{0,16}$");
});

test("the heartbeat hand-off's JSON Schema keeps the agreement's rules", () => {
  const schema = JSON.parse(jsonSchemaFiles()["heartbeats-request.schema.json"]!);
  // Only the station is always there; the station's own three are left out when it left them out.
  assert.deepEqual(schema.required, ["station_id"]);
  assert.equal(schema.properties.firmware_version.maxLength, 64);
  assert.equal(schema.properties.buffered_taps.type, "integer");
  assert.equal(schema.properties.buffered_taps.minimum, 0);
  assert.equal(schema.properties.buffered_taps.maximum, 2_147_483_647);
});

test("the meeting hand-off's JSON Schemas keep the agreement's rules", () => {
  const request = JSON.parse(jsonSchemaFiles()["meetings-request.schema.json"]!);
  // Both kinds are always there, null for none.
  assert.deepEqual(request.required, ["user_id", "user_kind", "owner_id", "owner_kind"]);
  assert.equal(request.properties.owner_id.maxLength, 128);
  const answer = JSON.parse(jsonSchemaFiles()["meetings-answer.schema.json"]!);
  assert.deepEqual(answer.properties.status.enum, [
    "answers_needed",
    "waiting",
    "connected",
    "already_connected",
    "same_kind",
    "no_kind",
    // Connecting across groups: the two in one group, or either in none (BAC-140).
    "same_group",
    "no_group",
  ]);
  const avatar = answer.properties.owner_avatar;
  assert.equal(avatar.default, null);
  assert.deepEqual(answer.required, ["status"]);
  const [look, none] = avatar.anyOf;
  assert.equal(look.type, "object");
  assert.deepEqual(look.required, ["character", "skin", "hair", "suit"]);
  for (const part of ["character", "skin", "hair", "suit"]) {
    assert.equal(look.properties[part].type, "string");
    assert.equal(look.properties[part].minLength, 1);
    assert.equal(look.properties[part].maxLength, 24);
    assert.equal(look.properties[part].pattern, "^[a-z0-9-]+$");
  }
  assert.deepEqual(none, { type: "null" });
});

test("a field added later doesn't break a team checking with an older JSON Schema", () => {
  // Fields are only ever added (the agreement's section 1), so none may be refused.
  for (const contents of Object.values(jsonSchemaFiles())) {
    assert.doesNotMatch(contents, /"additionalProperties": false/);
  }
});
