import assert from "node:assert/strict";
import { test } from "vitest";
import { MEETING_STATUSES, meetingsAnswer, meetingsRequest } from "./index.ts";

// The examples in the API agreement, 11.10.
const request = { user_id: "user-1", user_kind: "E", owner_id: "user-2", owner_kind: "B" };

test("the owner's avatar look passes whole for every meeting status", () => {
  for (const status of MEETING_STATUSES) {
    const answer = {
      status,
      owner_name: "Sam",
      owner_bio: null,
      owner_avatar: { character: "suit", skin: "warm", hair: "auburn", suit: "emerald" },
    };
    assert.deepEqual(meetingsAnswer.parse(answer), answer);
  }
});

test("a null owner avatar stays null for every meeting status", () => {
  for (const status of MEETING_STATUSES) {
    assert.equal(meetingsAnswer.parse({ status, owner_avatar: null }).owner_avatar, null);
  }
});

test("an answer from an Event Service without owner_avatar reads as null", () => {
  for (const status of MEETING_STATUSES) {
    assert.equal(meetingsAnswer.parse({ status }).owner_avatar, null);
  }
});

test("extra keys in the owner's avatar look are dropped", () => {
  const owner_avatar = { character: "suit", skin: "warm", hair: "auburn", suit: "emerald" };
  assert.deepEqual(
    meetingsAnswer.parse({ status: "waiting", owner_avatar: { ...owner_avatar, hat: "cap" } })
      .owner_avatar,
    owner_avatar,
  );
});

test("an unreadable owner avatar reads as null and the meeting status stays", () => {
  for (const owner_avatar of [
    {},
    { character: "suit", skin: "warm", hair: "auburn" },
    { character: "suit", skin: "warm", hair: "auburn", suit: "e".repeat(25) },
    { character: "suit", skin: "warm", hair: "auburn", suit: "Emerald" },
    { character: "suit", skin: "warm", hair: "auburn", suit: "" },
    { character: "suit", skin: "warm", hair: "auburn", suit: 7 },
    "emerald",
    7,
    [],
  ]) {
    assert.deepEqual(meetingsAnswer.parse({ status: "connected", owner_avatar }), {
      status: "connected",
      owner_name: null,
      owner_bio: null,
      owner_avatar: null,
    });
  }
});

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
    "no_kind",
    "same_group",
    "no_group",
  ]) {
    const answer = { status, owner_name: "Sam", owner_bio: null, owner_avatar: null };
    assert.deepEqual(meetingsAnswer.parse(answer), answer);
  }
});

test("an owner with no name answers null", () => {
  const answer = { status: "waiting", owner_name: null, owner_bio: null, owner_avatar: null };
  assert.deepEqual(meetingsAnswer.parse(answer), answer);
});

test("an answer from an Event Service without owner_name reads as null", () => {
  assert.deepEqual(meetingsAnswer.parse({ status: "waiting" }), {
    status: "waiting",
    owner_name: null,
    owner_bio: null,
    owner_avatar: null,
  });
});

test("an answer with the owner's bio keeps it, and a null one stays null", () => {
  for (const owner_bio of ["Building a robot arm", null]) {
    const answer = { status: "waiting", owner_name: "Sam", owner_bio, owner_avatar: null };
    assert.deepEqual(meetingsAnswer.parse(answer), answer);
  }
});

test("an answer from an Event Service without owner_bio reads as null", () => {
  assert.equal(meetingsAnswer.parse({ status: "waiting", owner_name: "Sam" }).owner_bio, null);
});

test("a name the owner set in any script, or a long login name, passes whole", () => {
  for (const owner_name of ["陈小明", "A".repeat(100)]) {
    const answer = { status: "connected", owner_name, owner_bio: null, owner_avatar: null };
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
    { status: "waiting", owner_bio: "" },
    { status: "waiting", owner_bio: 7 },
  ]) {
    assert.equal(meetingsAnswer.safeParse(body).success, false, JSON.stringify(body));
  }
});
