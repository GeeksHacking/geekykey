import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { describe, expect, it } from "vitest";
import { verifyFirebaseIdToken } from "./firebase-id-token.ts";

const PROJECT_ID = "geekykey-test";
const NOW = new Date("2026-11-18T02:00:00Z");
const nowSeconds = NOW.getTime() / 1000;

// Stands in for Google's signing keys: the tests sign with the private half, and
// the verifier sees only the public half, as it would from Google's key set.
const googleKeyPair = await generateKeyPair("RS256");
const googleKeys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(googleKeyPair.publicKey)), kid: "google-key-1", alg: "RS256" }],
});

/** A token shaped like Firebase's for a Google sign-in, five minutes old. */
function validClaims(): JWTPayload & Record<string, unknown> {
  return {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "firebase-uid-1",
    iat: nowSeconds - 300,
    exp: nowSeconds + 3300,
    auth_time: nowSeconds - 300,
    name: "Ada Lim",
    email: "ada@example.com",
    firebase: { sign_in_provider: "google.com" },
  };
}

async function sign(claims: JWTPayload, key = googleKeyPair.privateKey) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "google-key-1", typ: "JWT" })
    .sign(key);
}

function verify(token: string, keys: JWTVerifyGetKey = googleKeys) {
  return verifyFirebaseIdToken(token, { projectId: PROJECT_ID, keys, now: NOW });
}

describe("verifyFirebaseIdToken", () => {
  it("returns the Firebase user ID and display name from a valid token", async () => {
    expect(await verify(await sign(validClaims()))).toEqual({
      userId: "firebase-uid-1",
      displayName: "Ada Lim",
    });
  });

  it("gives no display name when the sign-in provider sent none", async () => {
    const { name: _, ...withoutName } = validClaims();
    expect(await verify(await sign(withoutName))).toEqual({
      userId: "firebase-uid-1",
      displayName: null,
    });
  });

  it("rejects a token signed by a key that isn't Google's", async () => {
    const forger = await generateKeyPair("RS256");
    expect(await verify(await sign(validClaims(), forger.privateKey))).toBeNull();
  });

  // Every Firebase project's tokens are signed by the same Google keys, so these
  // two claims are what stop another project's sign-in from working here.
  it("rejects a token for another Firebase project", async () => {
    expect(await verify(await sign({ ...validClaims(), aud: "someone-elses-app" }))).toBeNull();
  });

  it("rejects a token from another issuer", async () => {
    const iss = "https://securetoken.google.com/someone-elses-app";
    expect(await verify(await sign({ ...validClaims(), iss }))).toBeNull();
  });

  it("rejects a token with no expiry", async () => {
    const { exp: _, ...withoutExp } = validClaims();
    expect(await verify(await sign(withoutExp))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const claims = { ...validClaims(), iat: nowSeconds - 3700, exp: nowSeconds - 100 };
    expect(await verify(await sign(claims))).toBeNull();
  });

  it("rejects a token issued in the future", async () => {
    expect(await verify(await sign({ ...validClaims(), iat: nowSeconds + 60 }))).toBeNull();
  });

  it("rejects a token whose sign-in is in the future", async () => {
    expect(await verify(await sign({ ...validClaims(), auth_time: nowSeconds + 60 }))).toBeNull();
  });

  it("rejects a token with no user ID", async () => {
    const { sub: _, ...withoutSub } = validClaims();
    expect(await verify(await sign(withoutSub))).toBeNull();
    expect(await verify(await sign({ ...validClaims(), sub: "" }))).toBeNull();
  });

  it("rejects a user ID that isn't a string", async () => {
    expect(await verify(await sign({ ...validClaims(), sub: 42 as never }))).toBeNull();
  });

  it("rejects a user ID longer than Firebase's 128 characters", async () => {
    expect(await verify(await sign({ ...validClaims(), sub: "a".repeat(129) }))).toBeNull();
  });

  it("accepts only RS256, the algorithm Firebase signs with", async () => {
    const other = await generateKeyPair("ES256");
    const withOtherKey = createLocalJWKSet({
      keys: [{ ...(await exportJWK(other.publicKey)), kid: "other-key", alg: "ES256" }],
    });
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: "ES256", kid: "other-key", typ: "JWT" })
      .sign(other.privateKey);
    expect(await verify(token, withOtherKey)).toBeNull();
  });

  // A good sign-in mustn't be answered as a bad one because Google was slow to answer.
  it("throws when Google's keys can't be fetched", async () => {
    const token = await sign(validClaims());
    for (const failure of [new errors.JWKSTimeout(), new TypeError("fetch failed")]) {
      await expect(verify(token, () => Promise.reject(failure))).rejects.toBe(failure);
    }
  });
});
