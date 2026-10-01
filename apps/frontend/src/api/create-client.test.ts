import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppClient } from "@/api/create-client";

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
      .mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });

    await api.devLogin("dev-user-1");
    await expect(api.me()).resolves.toEqual(me);
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
      "/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("keeps the resource methods on the mock while the live slice is active", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const api = createAppClient({ live: true });
    await api.devLogin("dev-organizer-1");

    await expect(api.listStations()).resolves.toEqual(
      expect.objectContaining({ stations: expect.any(Array) }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
