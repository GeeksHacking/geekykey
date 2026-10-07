import { describe, expect, it } from "vitest";

import { LIVE_METHODS, createAppClient } from "@/api/create-client";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

/** With nothing live, the app client is the mock client and keeps its test controls. */
function mockBacked(live: boolean): MockApiClient {
  return createAppClient({ live }) as MockApiClient;
}

describe("createAppClient", () => {
  it("runs every method on the mock, because nothing is live yet", async () => {
    const client = mockBacked(false);
    client.mock.setSession(SEEDED_PARTICIPANT_ID);

    expect((await client.me()).user.id).toBe(SEEDED_PARTICIPANT_ID);
    expect((await client.getToken("04E5F7091B3D")).owner).toBe("nobody");
    expect(await client.claimToken("04E5F7091B3D")).toBeDefined();
  });

  it("still uses the mock with live requested, since liveMethods is empty", async () => {
    // Checkpoint 6 has not landed, so VITE_LIVE_API must not change anything yet.
    const client = mockBacked(true);
    client.mock.setSession(SEEDED_ADMIN_ID);

    expect((await client.listStations()).stations.length).toBeGreaterThan(0);
    expect(LIVE_METHODS.size).toBe(0);
  });

  it("exposes every interface method, so the two clients cannot drift apart", () => {
    const mock = createMockClient({ latencyMs: [0, 0], storage: null });
    const fromMock = Object.keys(mock)
      .filter((key) => key !== "mock")
      .sort();
    // Mirrored from ApiClient by hand on purpose: a forgotten method should fail here.
    expect(fromMock).toEqual(
      [
        "claimToken",
        "createStation",
        "devLogin",
        "disableStation",
        "enableStation",
        "getToken",
        "listStations",
        "loginUrl",
        "logout",
        "me",
        "releaseToken",
        "replaceStationKey",
        "setStationLink",
      ].sort(),
    );
  });
});
