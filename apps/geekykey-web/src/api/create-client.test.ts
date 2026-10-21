import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_METHODS, createAppClient } from "@/api/create-client";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

/** The app client keeps the mock's test controls, live or not. */
function appClient(live: boolean): MockApiClient {
  return createAppClient({ live }) as MockApiClient;
}

/** Agreement 8.4: the user, their tokens and the events to link to. */
const me = {
  user: { id: SEEDED_PARTICIPANT_ID, is_geekykey_admin: false },
  tokens: [{ uid: "04A1B2C3D4E5F6", claimed_at: "2026-10-10T08:30:00.000Z" }],
  events: [{ id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" }],
};

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse() {
  return new Response(null, { status: 204 });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAppClient", () => {
  it("runs every method on the mock, because the live flag is off", async () => {
    const client = appClient(false);
    client.mock.setSession(SEEDED_PARTICIPANT_ID);

    expect((await client.me()).user.id).toBe(SEEDED_PARTICIPANT_ID);
    expect((await client.getToken("04E5F7091B3D")).owner).toBe("nobody");
    expect(await client.claimToken("04E5F7091B3D")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the session slice to the service in live mode", async () => {
    fetchMock
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse(me))
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(noContentResponse());
    const client = appClient(true);

    await client.devLogin(SEEDED_PARTICIPANT_ID);
    await expect(client.me()).resolves.toEqual(me);
    await client.firebaseLogin("id-token-from-firebase");
    await client.logout();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/auth/dev-login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: SEEDED_PARTICIPANT_ID }),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/me",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/auth/firebase",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: "id-token-from-firebase" }),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("keeps the token methods on the mock while the session slice is live", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const client = appClient(true);
    await client.devLogin(SEEDED_PARTICIPANT_ID);

    await expect(client.getToken("04A1B2C3D4E5F6")).resolves.toEqual(
      expect.objectContaining({ owner: "you" }),
    );
    expect(await client.claimToken("04E5F7091B3D")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the mock the live session, so the mocked methods know the user", async () => {
    // The service's user is not the seeded participant, so the mock answers for
    // that user and not for the fixtures' owner.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...me, user: { id: "firebase-uid", is_geekykey_admin: false } }),
    );
    const client = appClient(true);

    await client.me();

    await expect(client.getToken("04A1B2C3D4E5F6")).resolves.toEqual(
      expect.objectContaining({ owner: "someone_else" }),
    );
  });

  it("keeps the mock's session when the service cannot answer", async () => {
    // A 503 says the claims stand-in is slow, not that the session is gone, so
    // the mock keeps the user it had.
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const client = appClient(true);
    await client.devLogin(SEEDED_PARTICIPANT_ID);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "claims_unavailable" }, 503));
    await expect(client.me()).rejects.toThrow();

    await expect(client.getToken("04A1B2C3D4E5F6")).resolves.toEqual(
      expect.objectContaining({ owner: "you" }),
    );
  });

  it("signs the mock out when the service says the session is gone", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const client = appClient(true);
    await client.devLogin(SEEDED_PARTICIPANT_ID);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthenticated" }, 401));
    await expect(client.me()).rejects.toThrow();

    await expect(client.getToken("04A1B2C3D4E5F6")).rejects.toThrow("unauthenticated");
  });

  it("names the live methods, so nothing waits for a list of its own", () => {
    expect([...LIVE_METHODS].sort()).toEqual(["devLogin", "firebaseLogin", "logout", "me"]);
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
        "devLogin",
        "firebaseLogin",
        "getToken",
        "logout",
        "me",
        "releaseToken",
      ].sort(),
    );
  });
});
