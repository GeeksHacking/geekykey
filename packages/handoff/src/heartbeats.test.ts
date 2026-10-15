import assert from "node:assert/strict";
import { test } from "vitest";
import { heartbeatsRequest } from "./index.ts";

// The example in the API agreement, 11.3.
const request = {
  station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  firmware_version: "0.3.1",
  buffered_taps: 0,
  reader_ok: true,
};

test("the agreement's heartbeat hand-off passes, and so does one with only the station", () => {
  assert.deepEqual(heartbeatsRequest.parse(request), request);
  assert.deepEqual(heartbeatsRequest.parse({ station_id: request.station_id }), {
    station_id: request.station_id,
  });
});

test("a heartbeat hand-off the agreement doesn't allow is rejected", () => {
  for (const [what, body] of [
    ["no station ID", { ...request, station_id: "" }],
    ["an empty firmware version", { ...request, firmware_version: "" }],
    ["a firmware version of 65 chars", { ...request, firmware_version: "1".repeat(65) }],
    ["saved taps below 0", { ...request, buffered_taps: -1 }],
    ["saved taps that aren't whole", { ...request, buffered_taps: 1.5 }],
    ["saved taps past 32 bits", { ...request, buffered_taps: 2 ** 31 }],
    ["saved taps as a string", { ...request, buffered_taps: "3" }],
    ["reader_ok as a string", { ...request, reader_ok: "true" }],
    ["a null for a field left out", { ...request, reader_ok: null }],
  ] as const) {
    assert.equal(heartbeatsRequest.safeParse(body).success, false, what);
  }
});

test("the most saved taps a 32-bit integer holds pass", () => {
  assert.equal(
    heartbeatsRequest.safeParse({ ...request, buffered_taps: 2 ** 31 - 1 }).success,
    true,
  );
});
