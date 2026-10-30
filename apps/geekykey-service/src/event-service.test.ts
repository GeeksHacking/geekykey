import assert from "node:assert/strict";
import { tapsAnswerMatching, type TapsRequest } from "@geekykey/handoff";
import { test } from "vitest";
import { quickTapsAnswer } from "./event-service.ts";

test("the quick check of the hand-off's answer agrees with tapsAnswerMatching", () => {
  const request: TapsRequest = {
    station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
    taps: [
      { client_tap_id: "t1", user_id: "user-1", tapped_at: null },
      { client_tap_id: "t2", user_id: "user-1", tapped_at: "2026-10-19T02:54:42.123Z" },
    ],
  };
  const schema = tapsAnswerMatching(request);
  const quick = quickTapsAnswer(request);
  const result = (client_tap_id: string, status: string) => ({ client_tap_id, status });
  // Answers an Event Service gives, which the quick check must take itself, or it saves nothing.
  const usual: unknown[] = [
    { results: [result("t1", "accepted"), result("t2", "cooldown")] },
    { results: [result("t1", "no_game"), result("t2", "another_teams_status2")] },
    { results: [{ ...result("t1", "duplicate"), extra: 1 }, result("t2", "accepted")], extra: 1 },
    {
      results: [
        { ...result("t1", "accepted"), lines: ["Alex: 6 of 6", "All 6 done!"], complete: true },
        { ...result("t2", "cooldown"), lines: ["3 of 6 stamps"] },
      ],
    },
    { results: [{ ...result("t1", "accepted"), complete: false }, result("t2", "no_game")] },
  ];
  const others: unknown[] = [
    undefined,
    null,
    [],
    {},
    { results: {} },
    { results: [result("t1", "accepted")] },
    { results: [result("t2", "accepted"), result("t1", "accepted")] },
    { results: [result("t1", "accepted"), result("t2", "accepted"), result("t3", "accepted")] },
    { results: [result("t1", "accepted"), null] },
    { results: [result("t1", "accepted"), { client_tap_id: "t2" }] },
    { results: [result("t1", "accepted"), result("t2", "Accepted")] },
    { results: [result("t1", "accepted"), result("t2", "no-game")] },
    { results: [result("t1", "accepted"), result("t2", "")] },
    { results: [result("t1", "accepted"), { client_tap_id: "t2", status: 1 }] },
    ...[
      [],
      ["a", "b", "c"],
      ["x".repeat(17)],
      ["José: 3 of 6"],
      ["3 of 6\n"],
      [3],
      "Tap counted!",
      null,
    ].map((lines) => ({
      results: [result("t1", "accepted"), { ...result("t2", "accepted"), lines }],
    })),
    { results: [result("t1", "accepted"), { ...result("t2", "accepted"), complete: "true" }] },
    { results: [result("t1", "accepted"), { ...result("t2", "accepted"), complete: null }] },
  ];
  for (const answer of [...usual, ...others]) {
    const parsed = schema.safeParse(answer).data;
    const fast = quick(answer);
    const what = String(JSON.stringify(answer)).slice(0, 80);
    // Never takes an answer the schema refuses, and never makes it into something else.
    if (fast !== undefined) assert.deepEqual(fast, parsed, what);
    if (usual.includes(answer)) assert.ok(fast, `the quick check took ${what}`);
  }
});
