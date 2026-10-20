import assert from "node:assert/strict";
import { test } from "vitest";
import { tapsAnswer, tapsAnswerMatching, tapsRequest } from "./index.ts";

// The examples in the API agreement, 11.2.
const request = {
  station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  taps: [
    { client_tap_id: "tap-000123", user_id: "user-1", tapped_at: "2026-10-10T01:00:00.000Z" },
    { client_tap_id: "tap-000124", user_id: "user-1", tapped_at: null },
  ],
};
const answer = {
  results: [
    { client_tap_id: "tap-000123", status: "accepted" },
    { client_tap_id: "tap-000124", status: "cooldown" },
  ],
};

test("the agreement's hand-off request and answer pass", () => {
  assert.deepEqual(tapsRequest.parse(request), request);
  assert.deepEqual(tapsAnswer.parse(answer), answer);
});

test("a request the agreement doesn't allow is rejected", () => {
  const tap = request.taps[0]!;
  for (const [what, body] of [
    ["no taps", { ...request, taps: [] }],
    ["501 taps", { ...request, taps: Array.from({ length: 501 }, () => tap) }],
    ["no station ID", { ...request, station_id: "" }],
    ["an empty client_tap_id", { ...request, taps: [{ ...tap, client_tap_id: "" }] }],
    [
      "a client_tap_id of 129 chars",
      { ...request, taps: [{ ...tap, client_tap_id: "x".repeat(129) }] },
    ],
    ["an empty user ID", { ...request, taps: [{ ...tap, user_id: "" }] }],
    ["a user ID of 129 chars", { ...request, taps: [{ ...tap, user_id: "u".repeat(129) }] }],
    ["no tapped_at", { ...request, taps: [{ client_tap_id: "t1", user_id: "user-1" }] }],
    [
      "a tapped_at with an offset",
      { ...request, taps: [{ ...tap, tapped_at: "2026-10-10T09:00:00.000+08:00" }] },
    ],
    [
      "a tapped_at without milliseconds",
      { ...request, taps: [{ ...tap, tapped_at: "2026-10-10T01:00:00Z" }] },
    ],
  ] as const) {
    assert.equal(tapsRequest.safeParse(body).success, false, what);
  }
});

test("a full batch of 500 taps passes", () => {
  const taps = Array.from({ length: 500 }, (_, i) => ({
    ...request.taps[1]!,
    client_tap_id: `t${i}`,
  }));
  assert.equal(tapsRequest.safeParse({ ...request, taps }).success, true);
});

test("an answer the agreement doesn't allow is rejected, even before it's matched to its taps", () => {
  // Other teams check with the JSON Schema alone, so it must hold the request's bounds too.
  const result = answer.results[0]!;
  for (const [what, results] of [
    ["no results", []],
    ["501 results", Array.from({ length: 501 }, () => result)],
    ["an empty client_tap_id", [{ ...result, client_tap_id: "" }]],
    ["a client_tap_id of 129 chars", [{ ...result, client_tap_id: "x".repeat(129) }]],
  ] as const) {
    assert.equal(tapsAnswer.safeParse({ results }).success, false, what);
  }
});

test("another team's own status passes, as long as it's snake_case", () => {
  const theirs = (status: string) => ({ results: [{ client_tap_id: "t1", status }] });
  assert.equal(tapsAnswer.safeParse(theirs("bingo_square_filled")).success, true);
  for (const status of ["", "Accepted", "no-game", "two words", "_accepted"]) {
    assert.equal(tapsAnswer.safeParse(theirs(status)).success, false, status);
  }
});

test("an answer whose results match the taps one for one passes", () => {
  assert.equal(tapsAnswerMatching(request).safeParse(answer).success, true);
});

test("an answer whose results don't match the taps one for one is rejected", () => {
  const [first, second] = answer.results;
  for (const [what, results] of [
    ["one result short", [first]],
    ["one result too many", [first, second, second]],
    ["in another order", [second, first]],
    ["another client_tap_id", [first, { ...second!, client_tap_id: "tap-999999" }]],
  ] as const) {
    assert.equal(tapsAnswerMatching(request).safeParse({ results }).success, false, what);
  }
});
