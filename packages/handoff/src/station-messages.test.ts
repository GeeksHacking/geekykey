import assert from "node:assert/strict";
import { test } from "vitest";
import { stationMessageAnswer, stationMessageFrame, stationMessageRequest } from "./index.ts";

// The examples in the API agreement's 6.3 and 11.12 (BAC-182).
const request = {
  station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  lines: ["Blue to B", "Tap here"],
  countdown: { seconds: 20, lines: ["Blue to B", "{s}s left"], ending: ["Missed it", ""] },
  beep: true,
};

test("the agreement's station message passes, and so does one with only lines", () => {
  assert.deepEqual(stationMessageRequest.parse(request), request);
  const plain = { station_id: request.station_id, lines: ["Blue won!"] };
  assert.deepEqual(stationMessageRequest.parse(plain), plain);
});

test("a station message the agreement doesn't allow is rejected", () => {
  for (const [what, body] of [
    ["no station ID", { ...request, station_id: "" }],
    ["no lines", { station_id: request.station_id }],
    ["no line in lines", { ...request, lines: [] }],
    ["three lines", { ...request, lines: ["a", "b", "c"] }],
    ["a line of 17 characters", { ...request, lines: ["x".repeat(17)] }],
    ["a line that isn't ASCII", { ...request, lines: ["Café"] }],
    [
      "a countdown of 100 seconds",
      { ...request, countdown: { ...request.countdown, seconds: 100 } },
    ],
    [
      "{s} twice in a countdown",
      { ...request, countdown: { ...request.countdown, lines: ["{s}", "{s}"] } },
    ],
    ["beep as a string", { ...request, beep: "true" }],
  ] as const) {
    assert.equal(stationMessageRequest.safeParse(body).success, false, what);
  }
});

test("the answer says whether a station's socket took the message", () => {
  assert.deepEqual(stationMessageAnswer.parse({ delivered: true }), { delivered: true });
  assert.deepEqual(stationMessageAnswer.parse({ delivered: false }), { delivered: false });
  assert.equal(stationMessageAnswer.safeParse({}).success, false);
});

test("the frame a station gets names its type and leaves the station's ID out", () => {
  const { station_id: _, ...message } = request;
  const frame = { type: "station_message", ...message };
  assert.deepEqual(stationMessageFrame.parse(frame), frame);
  assert.equal(stationMessageFrame.safeParse({ ...message }).success, false, "no type");
});
