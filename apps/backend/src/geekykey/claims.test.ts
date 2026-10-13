import assert from "node:assert/strict";
import { test } from "vitest";
import { claimToken, testApp, TEST_CLAIMS_STAND_IN_KEY } from "../test-helpers.ts";
import { ClaimsUnavailable, StandInClaims } from "./claims.ts";

// StandInClaims against the real claims stand-in, through the backend's own
// routes, as the GeekyKey side calls it inside the one server.

const app = testApp();

function standInClaims(key = TEST_CLAIMS_STAND_IN_KEY) {
  return new StandInClaims({
    url: "/claims-stand-in/v1",
    key,
    send: async (url, init) => app.request(url, init),
  });
}

/** Plenty of time: these tests aren't about the deadline. */
const signal = () => AbortSignal.timeout(4000);

test("the owners of the tokens someone owns, and none for the rest", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1");
  await claimToken("04C9E1A27B3080", "user-2");

  const owners = await standInClaims().ownersOf(
    ["04A1B2C3D4E5F6", "DEADBEEF", "04C9E1A27B3080"],
    signal(),
  );
  assert.deepEqual(
    owners,
    new Map([
      ["04A1B2C3D4E5F6", "user-1"],
      ["04C9E1A27B3080", "user-2"],
    ]),
  );
});

test("no UIDs, no owners", async () => {
  assert.deepEqual(await standInClaims().ownersOf([], signal()), new Map());
});

test("a claim is claimed, then already yours, and taken for anyone else", async () => {
  const claims = standInClaims();
  assert.equal(await claims.claim("04A1B2C3D4E5F6", "user-1", signal()), "claimed");
  assert.equal(await claims.claim("04A1B2C3D4E5F6", "user-1", signal()), "already_yours");
  assert.equal(await claims.claim("04A1B2C3D4E5F6", "user-2", signal()), "taken");
});

test("a token is released only by the owner named", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1");
  const claims = standInClaims();
  assert.equal(await claims.release("04A1B2C3D4E5F6", "user-2", signal()), "not_owner");
  assert.equal(await claims.release("04A1B2C3D4E5F6", "user-1", signal()), "released");
  assert.deepEqual(await claims.ownersOf(["04A1B2C3D4E5F6"], signal()), new Map());
});

test("a user's tokens, oldest claim first", async () => {
  await claimToken("04C9E1A27B3080", "dev-user/1", "2026-10-12T06:00:00.000Z");
  await claimToken("04A1B2C3D4E5F6", "dev-user/1", "2026-10-12T05:00:00.000Z");
  assert.deepEqual(await standInClaims().tokensOf("dev-user/1", signal()), [
    { uid: "04A1B2C3D4E5F6", claimedAt: "2026-10-12T05:00:00.000Z" },
    { uid: "04C9E1A27B3080", claimedAt: "2026-10-12T06:00:00.000Z" },
  ]);
});

test("with the wrong key, the stand-in can't answer, as until a new key is set on both sides", async () => {
  await assert.rejects(
    standInClaims("6".repeat(64)).ownersOf(["04A1B2C3D4E5F6"], signal()),
    (err) => err instanceof ClaimsUnavailable && err.status === 401,
  );
});
