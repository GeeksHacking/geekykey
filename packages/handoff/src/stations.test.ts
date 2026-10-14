import assert from "node:assert/strict";
import { test } from "vitest";
import { stationsAnswer } from "./index.ts";

// The example in the API agreement, 11.1.
const station = {
  station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  key_hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
};

test("the agreement's registered stations pass, and so does an empty list", () => {
  assert.deepEqual(stationsAnswer.parse({ stations: [station] }), { stations: [station] });
  assert.deepEqual(stationsAnswer.parse({ stations: [] }), { stations: [] });
});

test("registered stations the agreement doesn't allow are rejected", () => {
  for (const [what, body] of [
    ["no list", {}],
    ["no station ID", { stations: [{ ...station, station_id: "" }] }],
    ["no key hash", { stations: [{ station_id: station.station_id }] }],
    [
      "a key hash in upper case",
      { stations: [{ ...station, key_hash: station.key_hash.toUpperCase() }] },
    ],
    [
      "a key hash one character short",
      { stations: [{ ...station, key_hash: station.key_hash.slice(1) }] },
    ],
    ["a key instead of its hash", { stations: [{ ...station, key_hash: "gk_sta_abc" }] }],
  ] as const) {
    assert.equal(stationsAnswer.safeParse(body).success, false, what);
  }
});
