import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppClient } from "@/api/create-client";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

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
    // A mock build is the mock itself, so its test controls are there to sign it in.
    const client = createAppClient({ live: false }) as MockApiClient;
    client.mock.setSession(SEEDED_PARTICIPANT_ID);

    expect((await client.me()).user.id).toBe(SEEDED_PARTICIPANT_ID);
    expect((await client.getToken("04E5F7091B3D")).owner).toBe("nobody");
    expect(await client.claimToken("04E5F7091B3D")).toBeDefined();
    // The mock's link, which opens the Event screens' local address.
    expect((await client.createLoginLink("showcase")).url).toBe(
      "http://localhost:5173/#login=mock",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the login link to the service in live mode", async () => {
    // Agreement 8.6: the service makes the link, so the event's address and the
    // fragment's name are its to give.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        url: "https://event.geekshacking.com/#login=eyJ2IjoxfQ.c2ln",
        expires_at: "2026-10-22T13:01:00.000Z",
      }),
    );
    const client = createAppClient({ live: true });

    const link = await client.createLoginLink("showcase");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/login-links",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: "showcase" }),
        credentials: "include",
      }),
    );
    expect(link.url).toBe("https://event.geekshacking.com/#login=eyJ2IjoxfQ.c2ln");
  });

  it("sends the session to the service in live mode", async () => {
    fetchMock
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse(me))
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(noContentResponse());
    const client = createAppClient({ live: true });

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

  it("sends the token lookup, claim and release to the service in live mode", async () => {
    // Agreement 8.5, 8.2 and 8.3. A claim answers 201 when it is new and 200 when the
    // token is already yours, with the same body, and a release answers 204.
    const claimed = { uid: "04E5F7091B3D", claimed_at: "2026-10-22T09:00:00.000Z" };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          token: { uid: "04E5F7091B3D", owner: "nobody", claimed_at: null, owner_id: null },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ token: claimed }, 201))
      .mockResolvedValueOnce(jsonResponse({ token: claimed }, 200))
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(noContentResponse());
    const client = createAppClient({ live: true });

    await expect(client.getToken("04E5F7091B3D")).resolves.toEqual(
      expect.objectContaining({ owner: "nobody" }),
    );
    await expect(client.claimToken("04E5F7091B3D")).resolves.toEqual(claimed);
    await expect(client.claimToken("04E5F7091B3D")).resolves.toEqual(claimed);
    await client.releaseToken("04E5F7091B3D");
    // A GeekyKey admin names the owner the lookup showed.
    await client.releaseToken("04A1B2C3D4E5F6", "dev-user-2");

    const calls = fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method]);
    expect(calls).toEqual([
      ["/api/v1/tokens/04E5F7091B3D", undefined],
      ["/api/v1/tokens/04E5F7091B3D/claim", "POST"],
      ["/api/v1/tokens/04E5F7091B3D/claim", "POST"],
      ["/api/v1/tokens/04E5F7091B3D", "DELETE"],
      ["/api/v1/tokens/04A1B2C3D4E5F6?owner_id=dev-user-2", "DELETE"],
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    }
  });

  it("passes the service's 503 claims_unavailable through as the error", async () => {
    // Section 13: the token page, the claim form and My tokens then say "Couldn't
    // reach GeeksHacking. Try again."
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "claims_unavailable" }, 503));
    const client = createAppClient({ live: true });

    await expect(client.claimToken("04E5F7091B3D")).rejects.toThrow("claims_unavailable");
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
        "createLoginLink",
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
