import assert from "node:assert/strict";
import { test } from "vitest";
import { meetingsAnswer, meetingsRequest } from "./index.ts";

// The examples in the API agreement, 11.10.
const request = { user_id: "user-1", user_kind: "E", owner_id: "user-2", owner_kind: "B" };

test("the agreement's meeting hand-off and its answer pass", () => {
  assert.deepEqual(meetingsRequest.parse(request), request);
  assert.deepEqual(meetingsRequest.parse({ ...request, user_kind: null, owner_kind: null }), {
    ...request,
    user_kind: null,
    owner_kind: null,
  });
  for (const status of [
    "answers_needed",
    "waiting",
    "connected",
    "already_connected",
    "same_kind",
    "same_group",
    "no_group",
  ]) {
    const answer = { status, owner_name: "Sam" };
    assert.deepEqual(meetingsAnswer.parse(answer), answer);
  }
});

test("an owner with no name answers null", () => {
  const answer = { status: "waiting", owner_name: null };
  assert.deepEqual(meetingsAnswer.parse(answer), answer);
});

test("an answer from an Event Service without owner_name reads as null", () => {
  assert.deepEqual(meetingsAnswer.parse({ status: "waiting" }), {
    status: "waiting",
    owner_name: null,
  });
});

test("a name the owner set in any script, or a long login name, passes whole", () => {
  for (const owner_name of ["陈小明", "A".repeat(100)]) {
    const answer = { status: "connected", owner_name };
    assert.deepEqual(meetingsAnswer.parse(answer), answer);
  }
});

test("a meeting hand-off the agreement doesn't allow is rejected", () => {
  for (const [what, body] of [
    ["no user ID", { ...request, user_id: "" }],
    ["a user ID of 129 chars", { ...request, user_id: "u".repeat(129) }],
    ["no owner ID", { ...request, owner_id: "" }],
    ["an owner ID of 129 chars", { ...request, owner_id: "u".repeat(129) }],
    ["the owner as the user", { ...request, owner_id: request.user_id }],
    ["an empty kind", { ...request, user_kind: "" }],
    ["a kind of 33 chars", { ...request, owner_kind: "K".repeat(33) }],
    ["a kind left out", { user_id: "user-1", owner_id: "user-2", owner_kind: "B" }],
  ] as const) {
    assert.equal(meetingsRequest.safeParse(body).success, false, what);
  }
});

test("an answer the agreement doesn't allow is rejected", () => {
  for (const body of [
    {},
    { status: "accepted" },
    { status: "" },
    { status: null },
    { status: "waiting", owner_name: "" },
    { status: "waiting", owner_name: 7 },
  ]) {
    assert.equal(meetingsAnswer.safeParse(body).success, false, JSON.stringify(body));
  }
});
