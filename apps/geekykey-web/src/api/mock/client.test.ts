import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient, normalizeUid } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { ErrorCode } from "@/api/types";

function setup(userId: string = SEEDED_PARTICIPANT_ID): MockApiClient {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(userId);
  return api;
}

/** The one unclaimed token in the fixtures. */
const UNCLAIMED = "04E5F7091B3D";
/** Owned by p_1041 in the fixtures. */
const SOMEONE_ELSES = "04C3D5F70912";

async function codeOf(work: () => Promise<unknown>): Promise<ErrorCode> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
  throw new Error("expected the call to reject");
}

describe("geekykey-web mock client", () => {
  describe("token UIDs", () => {
    it("normalises separators and case to one token", () => {
      expect(normalizeUid("04:a1:b2:c3:d4:e5:f6")).toBe("04A1B2C3D4E5F6");
      expect(normalizeUid("04-a1-b2-c3-d4-e5-f6")).toBe("04A1B2C3D4E5F6");
      expect(normalizeUid("04a1b2c3d4e5f6")).toBe("04A1B2C3D4E5F6");
    });

    it("looks a token up in any separator style", async () => {
      const api = setup();
      expect((await api.getToken("04:e5:f7:09:1b:3d")).uid).toBe(UNCLAIMED);
      expect((await api.getToken("04e5f7091b3d")).uid).toBe(UNCLAIMED);
    });

    it("rejects a UID that is too short to be a token", async () => {
      const api = setup();
      expect(await codeOf(() => api.getToken("04A1"))).toBe("validation_failed");
      expect(await codeOf(() => api.getToken(""))).toBe("validation_failed");
    });

    it("rejects a UID longer than ten bytes", async () => {
      const api = setup();
      expect(await codeOf(() => api.getToken("04A1B2C3D4E5F60718293"))).toBe("validation_failed");
    });
  });

  describe("claiming", () => {
    it("gives the first claim to whoever asks first", async () => {
      const api = setup();
      const token = await api.claimToken(UNCLAIMED);
      expect(token.uid).toBe(UNCLAIMED);
      expect(token.claimed_at).not.toBeNull();
      expect((await api.getToken(UNCLAIMED)).owner).toBe("you");
    });

    it("answers token_taken when someone else already holds it", async () => {
      const api = setup();
      await api.claimToken(UNCLAIMED);

      // Same fixture data, a different signed-in user, so the token is not theirs.
      api.mock.setSession("dev-user-9");
      expect(await codeOf(() => api.claimToken(UNCLAIMED))).toBe("token_taken");
    });

    it("is idempotent: claiming your own token again succeeds and does not count twice", async () => {
      const api = setup();
      const before = await api.me();
      const first = await api.claimToken(UNCLAIMED);
      const again = await api.claimToken(UNCLAIMED);
      const after = await api.me();

      expect(again.claimed_at).toBe(first.claimed_at);
      // The seeded participant held two, so a third is allowed but never a fourth.
      expect(before.tokens).toHaveLength(2);
      expect(after.tokens).toHaveLength(3);
      expect(after.tokens.filter((token) => token.uid === UNCLAIMED)).toHaveLength(1);
    });

    it("answers token_limit_reached on a fourth token", async () => {
      const api = setup();
      await api.claimToken(UNCLAIMED);
      expect((await api.me()).tokens).toHaveLength(3);
      // 04D9E1F3A5B7 belongs to p_1066, so take the other unclaimed slot too.
      await api.mock.data.tokens.push({ uid: "04F1A3B5D7E9", owner_id: null, claimed_at: null });
      expect(await codeOf(() => api.claimToken("04F1A3B5D7E9"))).toBe("token_limit_reached");
    });

    it("answers token_limit_reached, not token_taken, for someone else's token at the limit", async () => {
      const api = setup();
      await api.claimToken(UNCLAIMED);
      expect((await api.me()).tokens).toHaveLength(3);
      expect(await codeOf(() => api.claimToken(SOMEONE_ELSES))).toBe("token_limit_reached");
    });

    it("still answers already yours at the limit", async () => {
      const api = setup();
      const claimed = await api.claimToken(UNCLAIMED);
      expect((await api.me()).tokens).toHaveLength(3);
      expect((await api.claimToken(UNCLAIMED)).claimed_at).toBe(claimed.claimed_at);
    });

    it("claims a well-formed UID no fixture carries, adding it", async () => {
      // 8.2 lists no not_found, and 8.5 says nothing looks missing either, so a UID the
      // hardware could answer with reads as an unclaimed token.
      const api = setup();
      const token = await api.claimToken("04FFFFFFFFFF");
      expect(token.uid).toBe("04FFFFFFFFFF");
      expect(token.claimed_at).not.toBeNull();
      expect((await api.getToken("04FFFFFFFFFF")).owner).toBe("you");
    });

    it("rejects an odd number of hex characters, which is not whole bytes", async () => {
      const api = setup();
      // 9 characters is 4.5 bytes. No chip carries that.
      expect(await codeOf(() => api.getToken("04A1B2C3D"))).toBe("validation_failed");
      expect(await codeOf(() => api.claimToken("04A1B2C3D"))).toBe("validation_failed");
    });

    it("needs a session", async () => {
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      expect(await codeOf(() => api.claimToken(UNCLAIMED))).toBe("unauthenticated");
    });
  });

  describe("releasing", () => {
    it("lets the owner release, and then anyone can claim it", async () => {
      const api = setup();
      await api.claimToken(UNCLAIMED);
      await api.releaseToken(UNCLAIMED);

      const lookup = await api.getToken(UNCLAIMED);
      expect(lookup.owner).toBe("nobody");
      expect(lookup.claimed_at).toBeNull();

      api.mock.setSession("dev-user-9");
      expect((await api.claimToken(UNCLAIMED)).uid).toBe(UNCLAIMED);
    });

    it("answers not_found when a non-owner releases without owner_id", async () => {
      const api = setup();
      expect(await codeOf(() => api.releaseToken(SOMEONE_ELSES))).toBe("not_found");
    });

    it("answers not_found when releasing a token nobody has claimed", async () => {
      const api = setup();
      expect(await codeOf(() => api.releaseToken(UNCLAIMED))).toBe("not_found");
    });

    it("answers not_found for a UID no fixture carries", async () => {
      // Unlike the lookup and the claim, 8.3 does list not_found.
      const api = setup();
      expect(await codeOf(() => api.releaseToken("04FFFFFFFFFF"))).toBe("not_found");
    });

    it("lets a GeekyKey admin release someone else's with owner_id", async () => {
      const api = setup(SEEDED_ADMIN_ID);
      await api.releaseToken(SOMEONE_ELSES, "p_1041");
      expect((await api.getToken(SOMEONE_ELSES)).owner).toBe("nobody");
    });

    it("answers not_found when owner_id is not the current owner", async () => {
      const api = setup(SEEDED_ADMIN_ID);
      // A stale click: the token is now owned by somebody else.
      expect(await codeOf(() => api.releaseToken(SOMEONE_ELSES, "p_9999"))).toBe("not_found");
    });

    it("answers not_found when an admin releases an unclaimed token with owner_id", async () => {
      const api = setup(SEEDED_ADMIN_ID);
      // Nothing holds it, so no owner_id can match.
      expect(await codeOf(() => api.releaseToken(UNCLAIMED, "p_1041"))).toBe("not_found");
    });

    it("lets an admin who owns the token release it with their own owner_id", async () => {
      // Nothing forbids it: the admin's ID is the current owner, so it matches.
      const api = setup(SEEDED_ADMIN_ID);
      await api.claimToken(UNCLAIMED);
      expect(await api.releaseToken(UNCLAIMED, SEEDED_ADMIN_ID)).toBeUndefined();
      expect((await api.getToken(UNCLAIMED)).owner).toBe("nobody");
    });

    it("answers forbidden when a non-admin passes owner_id", async () => {
      const api = setup(SEEDED_PARTICIPANT_ID);
      expect(await codeOf(() => api.releaseToken(SOMEONE_ELSES, "p_1041"))).toBe("forbidden");
    });
  });

  describe("the token lookup", () => {
    it("says nobody, and offers no owner_id, for an unclaimed token", async () => {
      const api = setup();
      const lookup = await api.getToken(UNCLAIMED);
      expect(lookup.owner).toBe("nobody");
      expect(lookup.owner_id).toBeNull();
    });

    it("looks up a well-formed UID no fixture carries as unclaimed, and adds nothing", async () => {
      const api = setup();
      const before = api.mock.data.tokens.length;

      const lookup = await api.getToken("04FFFFFFFFFF");
      expect(lookup.uid).toBe("04FFFFFFFFFF");
      expect(lookup.owner).toBe("nobody");
      expect(lookup.claimed_at).toBeNull();
      // Reading must not mint a token; only claiming one does.
      expect(api.mock.data.tokens).toHaveLength(before);
    });

    it("rejects a UID that is only separators, since it normalises to nothing", async () => {
      const api = setup();
      expect(await codeOf(() => api.getToken(":::::"))).toBe("validation_failed");
    });

    it("shows your own claim time, but never the owner's ID, when it is yours", async () => {
      const api = setup();
      const lookup = await api.getToken("04A1B2C3D4E5F6");
      expect(lookup.owner).toBe("you");
      expect(lookup.claimed_at).not.toBeNull();
      expect(lookup.owner_id).toBeNull();
    });

    it("hides the owner from a plain user but shows it to a GeekyKey admin", async () => {
      const plain = setup();
      expect((await plain.getToken(SOMEONE_ELSES)).owner_id).toBeNull();

      const admin = setup(SEEDED_ADMIN_ID);
      expect((await admin.getToken(SOMEONE_ELSES)).owner_id).toBe("p_1041");
    });

    it("shows no claim time for someone else's token", async () => {
      const api = setup();
      expect((await api.getToken(SOMEONE_ELSES)).claimed_at).toBeNull();
    });
  });

  describe("/me", () => {
    it("lists the user's tokens oldest claim first, and says who they are", async () => {
      const api = setup();
      const me = await api.me();
      expect(me.user).toEqual({ id: SEEDED_PARTICIPANT_ID, is_geekykey_admin: false });
      expect(me.tokens.map((token) => token.uid)).toEqual(["04A1B2C3D4E5F6", "04B7C9E1F3A5"]);
    });

    it("marks a GeekyKey admin", async () => {
      const api = setup(SEEDED_ADMIN_ID);
      expect((await api.me()).user.is_geekykey_admin).toBe(true);
    });

    it("offers one event with a public address", async () => {
      const api = setup();
      const me = await api.me();
      expect(me.events).toEqual([
        { id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" },
      ]);
    });

    it("drops a released token from the list", async () => {
      const api = setup();
      await api.releaseToken("04A1B2C3D4E5F6");
      expect((await api.me()).tokens.map((token) => token.uid)).toEqual(["04B7C9E1F3A5"]);
    });

    it("needs a session", async () => {
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      expect(await codeOf(() => api.me())).toBe("unauthenticated");
    });
  });

  describe("auth and failure simulation", () => {
    it("signs in any user id, because the service keeps no users", async () => {
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      await api.devLogin("dev-user-77");
      expect((await api.me()).user.id).toBe("dev-user-77");
    });

    it("signs out", async () => {
      const api = setup();
      await api.logout();
      expect(await codeOf(() => api.me())).toBe("unauthenticated");
    });

    it("builds the login URL from a return path", () => {
      const api = setup();
      expect(api.loginUrl("/t/04A1B2C3D4E5F6")).toBe("/auth/login?return_to=%2Ft%2F04A1B2C3D4E5F6");
    });

    it("fails exactly the next call with the given code", async () => {
      const api = setup();
      api.mock.failNext("rate_limited");
      expect(await codeOf(() => api.me())).toBe("rate_limited");
      // The failure was consumed, so the next call is normal again.
      expect((await api.me()).user.id).toBe(SEEDED_PARTICIPANT_ID);
    });

    it("can fail with a network error too", async () => {
      const api = setup();
      api.mock.failNext("network");
      await expect(api.me()).rejects.toThrow(/Could not reach the server/);
    });
  });

  describe("claims_unavailable", () => {
    // Agreement 0.3: every one of 8.2 to 8.5 answers 503 when the claims stand-in, or the
    // Portal after the switch, cannot say who owns a token within 4 seconds. Nothing is
    // saved, so a claim that hits it must leave the token unclaimed.
    it("answers 503 from a lookup", async () => {
      const api = setup();
      api.mock.failNext("claims_unavailable");

      try {
        await api.getToken(UNCLAIMED);
        throw new Error("expected the call to reject");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe("claims_unavailable");
        expect((error as ApiError).status).toBe(503);
      }
    });

    it("answers 503 from a claim and saves nothing", async () => {
      const api = setup();
      api.mock.failNext("claims_unavailable");

      expect(await codeOf(() => api.claimToken(UNCLAIMED))).toBe("claims_unavailable");
      // Nothing was saved, so the token is still nobody's.
      expect((await api.getToken(UNCLAIMED)).owner).toBe("nobody");
      expect((await api.me()).tokens).toHaveLength(2);
    });

    it("answers 503 from a release and keeps the claim", async () => {
      const api = setup();
      await api.claimToken(UNCLAIMED);
      api.mock.failNext("claims_unavailable");

      expect(await codeOf(() => api.releaseToken(UNCLAIMED))).toBe("claims_unavailable");
      expect((await api.getToken(UNCLAIMED)).owner).toBe("you");
    });

    it("answers 503 from /me", async () => {
      const api = setup();
      api.mock.failNext("claims_unavailable");
      expect(await codeOf(() => api.me())).toBe("claims_unavailable");
    });
  });

  describe("no station endpoints since 0.3", () => {
    it("has no station methods left on the client", () => {
      // Section 10 is empty: each Event Service registers its own stations now, so the
      // registry belongs to apps/frontend (agreement 9.7 to 9.9).
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      const methods = Object.keys(api).filter((key) => key !== "mock");
      for (const gone of [
        "listStations",
        "createStation",
        "replaceStationKey",
        "setStationLink",
        "disableStation",
        "enableStation",
      ]) {
        expect(methods).not.toContain(gone);
      }
    });

    it("keeps no station fixtures", () => {
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      expect(api.mock.data).not.toHaveProperty("stations");
    });

    it("still keeps the admin list, because releasing someone's token is still an admin job", async () => {
      const api = setup(SEEDED_ADMIN_ID);
      expect((await api.me()).user.is_geekykey_admin).toBe(true);
      await api.releaseToken(SOMEONE_ELSES, "p_1041");
      expect((await api.getToken(SOMEONE_ELSES)).owner).toBe("nobody");
    });
  });
});
