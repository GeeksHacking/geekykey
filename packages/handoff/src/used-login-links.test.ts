import assert from "node:assert/strict";
import { test } from "vitest";
import { usedLoginLinksAnswer, usedLoginLinksRequest } from "./index.ts";

// The example in the API agreement, 11.11.
const request = { jti: "9f2c4e00000000000000000000000000", expires_at: "2026-11-18T13:01:00.000Z" };

test("the agreement's request to mark a login link used passes, and so do both answers", () => {
  assert.deepEqual(usedLoginLinksRequest.parse(request), request);
  assert.deepEqual(usedLoginLinksAnswer.parse({ first_use: true }), { first_use: true });
  assert.deepEqual(usedLoginLinksAnswer.parse({ first_use: false }), { first_use: false });
});

test("a request or answer the agreement doesn't allow is rejected", () => {
  for (const [what, body] of [
    ["a jti of 31 hex characters", { ...request, jti: "9f2c4e0000000000000000000000000" }],
    ["a jti in capitals", { ...request, jti: "9F2C4E00000000000000000000000000" }],
    ["no jti", { expires_at: request.expires_at }],
    ["an expiry that isn't a time", { ...request, expires_at: "soon" }],
    ["an expiry as seconds", { ...request, expires_at: 1795006860 }],
    ["no expiry", { jti: request.jti }],
  ] as const) {
    assert.equal(usedLoginLinksRequest.safeParse(body).success, false, what);
  }
  for (const [what, body] of [
    ["no first_use", {}],
    ["first_use as a string", { first_use: "true" }],
  ] as const) {
    assert.equal(usedLoginLinksAnswer.safeParse(body).success, false, what);
  }
});
