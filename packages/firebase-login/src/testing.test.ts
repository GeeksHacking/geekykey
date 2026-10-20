import { errors } from "jose";
import { describe, expect, it } from "vitest";
import { verifyFirebaseIdToken } from "./firebase-id-token.ts";
import { fakeGoogle, unreachableGoogleKeys } from "./testing.ts";

const PROJECT_ID = "geekykey-test";

describe("fakeGoogle", () => {
  it("signs tokens the verifier trusts with its keys, and only with them", async () => {
    const google = await fakeGoogle(PROJECT_ID);
    const other = await fakeGoogle(PROJECT_ID);
    const token = await google.signIdToken({ sub: "firebase-uid-1", name: "Ada Lim" });

    expect(
      await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, keys: google.keys }),
    ).toEqual({ userId: "firebase-uid-1", displayName: "Ada Lim" });
    expect(
      await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, keys: other.keys }),
    ).toBeNull();
  });
});

describe("unreachableGoogleKeys", () => {
  it("makes the verifier throw, as when Google's keys can't be fetched", async () => {
    const token = await (await fakeGoogle(PROJECT_ID)).signIdToken({ sub: "firebase-uid-1" });
    await expect(
      verifyFirebaseIdToken(token, { projectId: PROJECT_ID, keys: unreachableGoogleKeys }),
    ).rejects.toBeInstanceOf(errors.JWKSTimeout);
  });
});
