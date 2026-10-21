import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import type { GoogleSigningKeys } from "./firebase-id-token.ts";

/** What a test puts in an ID token: who signed in, and anything to add or replace. */
export type IdTokenClaims = JWTPayload & { sub: string; name?: string };

/**
 * Google's signing keys, faked for a service's tests. Give the service `keys`
 * in place of googleSigningKeys(), and log in with a token from
 * `signIdToken`, which it then trusts as it would one of Firebase's.
 */
export async function fakeGoogle(projectId: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const kid = "fake-google-key";
  const keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid, alg: "RS256" }],
  });

  /**
   * An ID token for `projectId`, shaped like Firebase's after a Google
   * sign-in a minute ago and valid for the next hour. `claims` are added to
   * those, or replace them, so a test can make one expired or for another
   * project. There's no `name` unless the test gives one.
   */
  function signIdToken(claims: IdTokenClaims): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      iat: nowSeconds - 60,
      exp: nowSeconds + 3540,
      auth_time: nowSeconds - 60,
      firebase: { sign_in_provider: "google.com" },
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
      .sign(privateKey);
  }

  return {
    keys,
    signIdToken,
    /**
     * An ID token for a guest, shaped like Firebase's after `signInAnonymously`
     * (the API agreement's 7.2): no name, no email, and `anonymous` as the
     * sign-in provider.
     */
    signGuestIdToken(sub: string): Promise<string> {
      return signIdToken({
        sub,
        provider_id: "anonymous",
        firebase: { identities: {}, sign_in_provider: "anonymous" },
      });
    },
  };
}

/** Google's keys when they can't be fetched, as when the request for them times out. */
export const unreachableGoogleKeys: GoogleSigningKeys = () =>
  Promise.reject(new errors.JWKSTimeout());
