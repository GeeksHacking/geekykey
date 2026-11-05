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
  for (const status of ["waiting", "connected", "already_connected", "same_kind", "no_group"]) {
    assert.deepEqual(meetingsAnswer.parse({ status }), { status });
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

test("an answer with a status the agreement doesn't list is rejected", () => {
  for (const body of [{}, { status: "accepted" }, { status: "" }, { status: null }]) {
    assert.equal(meetingsAnswer.safeParse(body).success, false, JSON.stringify(body));
  }
});
