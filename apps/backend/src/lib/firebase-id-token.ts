import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/**
 * Google's public keys for Firebase ID tokens, the same set Firebase's docs
 * give as X.509 certificates, here as a JWK set.
 */
const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/**
 * The keys for `verifyFirebaseIdToken`. Make one per process and keep it: it
 * caches the keys for an hour, and fetches them sooner when a token names one
 * it hasn't seen, which is how Google's key rotation reaches it. Google says
 * its keys may be cached for hours, so an hour is well within that.
 */
export function googleSigningKeys(): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(GOOGLE_KEYS_URL), { cacheMaxAge: 60 * 60 * 1000 });
}

/** What jose throws when it's the token that's wrong. */
const BAD_TOKEN_ERRORS = [
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
  errors.JWSSignatureVerificationFailed,
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
];

export interface FirebaseIdentity {
  userId: string;
  displayName: string | null;
}

export interface VerifyFirebaseIdTokenOptions {
  /** The Firebase project the token must be for, from FIREBASE_PROJECT_ID. */
  projectId: string;
  /** Google's public signing keys. */
  keys: JWTVerifyGetKey;
  now?: Date;
}

/**
 * Who a Firebase ID token says the user is, or null when the token can't be
 * trusted.
 */
export async function verifyFirebaseIdToken(
  token: string,
  { projectId, keys, now = new Date() }: VerifyFirebaseIdTokenOptions,
): Promise<FirebaseIdentity | null> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      // jose checks `exp` only when it's there.
      requiredClaims: ["exp"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      currentDate: now,
    }));
  } catch (error) {
    if (BAD_TOKEN_ERRORS.some((errorClass) => error instanceof errorClass)) return null;
    // Anything else, such as Google's keys not arriving, says nothing about the token.
    throw error;
  }
  // jose checks `exp`, but not that `iat` and `auth_time` are already past, which
  // Firebase's rules for verifying a token also ask for.
  const nowSeconds = now.getTime() / 1000;
  if (!isPast(payload.iat, nowSeconds) || !isPast(payload.auth_time, nowSeconds)) return null;
  // Firebase's UIDs are 1 to 128 characters, which is also what users.id holds.
  const { sub } = payload;
  if (typeof sub !== "string" || !sub || sub.length > 128) return null;
  return {
    userId: sub,
    displayName: typeof payload.name === "string" ? payload.name : null,
  };
}

function isPast(seconds: unknown, nowSeconds: number): boolean {
  return typeof seconds === "number" && seconds <= nowSeconds;
}
