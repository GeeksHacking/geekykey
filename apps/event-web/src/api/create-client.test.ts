import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_METHODS, createAppClient } from "@/api/create-client";

const me = {
  user: { id: "dev-user-1", display_name: "Alex", role: "participant" as const },
  points: 0,
  stamps: [],
  recent_taps: [],
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
  it("uses the HTTP session slice in live mode", async () => {
    fetchMock
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse(me))
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });

    await api.devLogin("dev-user-1");
    await expect(api.me()).resolves.toEqual(me);
    await api.firebaseLogin("id-token-from-firebase");
    await api.logout();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/auth/dev-login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "dev-user-1" }),
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

  it("keeps the resource methods on the mock while the live slice is active", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    await expect(api.listStationBoard()).resolves.toEqual(
      expect.objectContaining({ stations: expect.any(Array) }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the mock's session when the service cannot answer", async () => {
    // A 503 says the service is down, not that the session is gone, so the mock
    // keeps the organiser it had and the mocked screens still work. The body is
    // the Worker's own 503 (agreement 2): the screens' code list has no entry for
    // it, so the client falls back to the status.
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "service_unavailable" }, 503));
    await expect(api.me()).rejects.toThrow();

    await expect(api.listStationBoard()).resolves.toEqual(
      expect.objectContaining({ stations: expect.any(Array) }),
    );
  });

  it("keeps the mock's session when a dev login fails", async () => {
    // The failed login leaves the service's cookie as it was, so the mock keeps
    // the organiser it had.
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "service_unavailable" }, 503));
    await expect(api.devLogin("dev-user-1")).rejects.toThrow();

    await expect(api.listStationBoard()).resolves.toEqual(
      expect.objectContaining({ stations: expect.any(Array) }),
    );
  });

  it("drops the mock's session when a Firebase login starts", async () => {
    // A /me that cannot answer once the login is through must not leave the mock
    // signed in as the user who was there before.
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    fetchMock.mockResolvedValueOnce(noContentResponse());
    await api.firebaseLogin("id-token-from-firebase");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "service_unavailable" }, 503));
    await expect(api.me()).rejects.toThrow();

    await expect(api.listStationBoard()).rejects.toThrow("unauthenticated");
  });

  it("sends the login link to the service", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });

    await api.loginLink("eyJ2IjoxfQ.c2ln");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/login-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ login_link: "eyJ2IjoxfQ.c2ln" }),
        credentials: "include",
      }),
    );
  });

  it("drops the mock's session once a login link logs someone in", async () => {
    // The link's user replaces the one who was there (agreement 7.4), so a /me that
    // cannot answer straight afterwards must not leave the mock signed in as them.
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    fetchMock.mockResolvedValueOnce(noContentResponse());
    await api.loginLink("eyJ2IjoxfQ.c2ln");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "service_unavailable" }, 503));
    await expect(api.me()).rejects.toThrow();

    await expect(api.listStationBoard()).rejects.toThrow("unauthenticated");
  });

  it("keeps the mock's session when a login link fails", async () => {
    // Agreement 7.4: a link that fails leaves the existing session as it was.
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_login_link" }, 401));
    await expect(api.loginLink("eyJ2IjoxfQ.c2ln")).rejects.toThrow("invalid_login_link");

    await expect(api.listStationBoard()).resolves.toEqual(
      expect.objectContaining({ stations: expect.any(Array) }),
    );
  });

  it("names the live methods, so the notice and the tests read one list", () => {
    expect([...LIVE_METHODS].sort()).toEqual([
      "devLogin",
      "firebaseLogin",
      "loginLink",
      "logout",
      "me",
    ]);
  });
});
