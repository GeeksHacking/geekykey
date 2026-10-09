import { describe, expect, it } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { createFixtures, type MockData } from "@/api/mock/fixtures";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

/**
 * Rules the fixtures cannot prove on their own, because today the fixtures and the code
 * happen to agree. Each test here breaks that agreement deliberately — a claim time out of
 * order, a clock that moves between two calls — so the rule has to be the thing doing the
 * work rather than the shape of the seed data.
 *
 * Separate from client.test.ts on purpose: that file drives the mock as a client, this one
 * arranges the data so a wrong answer is visible.
 */

function mock(data: MockData, session: string, now?: () => number): MockApiClient {
  const api = createMockClient({ latencyMs: [0, 0], storage: null, data, now });
  api.mock.setSession(session);
  return api;
}

describe("agreement 8.4: /me lists the user's tokens oldest claim first", () => {
  it("orders by claim time, not by the order the fixtures happen to be in", async () => {
    const data = createFixtures(Date.UTC(2026, 9, 7, 8, 0, 0));
    const [first, second] = data.tokens;
    // Swap the two seeded claim times, so the fixture order is the reverse of the
    // chronological order. Without the sort in `ownedTokens`, this reads back unsorted.
    const swap = first!.claimed_at!;
    first!.claimed_at = second!.claimed_at;
    second!.claimed_at = swap;
    const fixtureOrder = [first!.uid, second!.uid];

    const me = await mock(data, SEEDED_PARTICIPANT_ID).me();

    expect(me.tokens.map((token) => token.uid)).toEqual([...fixtureOrder].reverse());
    const times = me.tokens.map((token) => token.claimed_at ?? "");
    expect([...times].sort()).toEqual(times);
  });

  it("puts a token claimed later after the ones claimed earlier", async () => {
    const clock = { at: Date.UTC(2026, 9, 7, 8, 0, 0) };
    const data = createFixtures(clock.at);
    const api = mock(data, "dev-user-9", () => (clock.at += 60_000));

    await api.claimToken("04E5F7091B3D");

    const me = await api.me();
    const times = me.tokens.map((token) => token.claimed_at ?? "");
    expect([...times].sort()).toEqual(times);
  });
});

describe("agreement 8.2: claiming a token you already own is idempotent", () => {
  it("keeps the original claimed_at, with a clock that moves between the two calls", async () => {
    // The existing test compares two claim times, but with a real clock both calls land in
    // the same millisecond, so re-stamping would be invisible. Here every call advances the
    // clock by a minute, so it would show.
    const clock = { at: Date.UTC(2026, 9, 7, 8, 0, 0) };
    const data = createFixtures(clock.at);
    const api = mock(data, SEEDED_PARTICIPANT_ID, () => (clock.at += 60_000));

    const first = await api.claimToken("04E5F7091B3D");
    const before = (await api.me()).tokens.find((t) => t.uid === "04E5F7091B3D")?.claimed_at;
    const again = await api.claimToken("04E5F7091B3D");
    const after = (await api.me()).tokens.find((t) => t.uid === "04E5F7091B3D")?.claimed_at;

    expect(again.claimed_at).toBe(first.claimed_at);
    expect(after).toBe(before);
    expect((await api.me()).tokens.filter((t) => t.uid === "04E5F7091B3D")).toHaveLength(1);
  });

  it("keeps a seeded token's own claim time", async () => {
    const clock = { at: Date.UTC(2026, 9, 7, 8, 0, 0) };
    const data = createFixtures(clock.at);
    const seeded = data.tokens.find((t) => t.uid === "04A1B2C3D4E5F6")!.claimed_at;
    const api = mock(data, SEEDED_PARTICIPANT_ID, () => (clock.at += 60_000));

    expect((await api.claimToken("04A1B2C3D4E5F6")).claimed_at).toBe(seeded);
  });
});

describe("agreement 8.3: a GeekyKey admin's release, with a clock that moves", () => {
  it("does not release a claim that changed after the page loaded", async () => {
    // The stale-click rule: the admin passes the owner_id the lookup showed, so a token
    // re-claimed in the meantime keeps its new owner.
    const clock = { at: Date.UTC(2026, 9, 7, 8, 0, 0) };
    const data = createFixtures(clock.at);
    const admin = mock(data, SEEDED_ADMIN_ID, () => (clock.at += 60_000));

    await expect(admin.releaseToken("04A1B2C3D4E5F6", "dev-user-9")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });

    // Still owned by the seeded participant, and the admin can still see who.
    const lookup = await admin.getToken("04A1B2C3D4E5F6");
    expect(lookup.owner).toBe("someone_else");
    expect(lookup.owner_id).toBe(SEEDED_PARTICIPANT_ID);
  });
});
