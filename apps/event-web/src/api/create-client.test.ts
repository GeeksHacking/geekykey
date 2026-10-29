import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppClient } from "@/api/create-client";
import type { MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";

const me = {
  user: { id: "dev-user-1", display_name: "Alex", role: "participant" as const, has_name: true },
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
  it("runs every method on the mock, because the live flag is off", async () => {
    // A mock build is the mock itself, so its test controls are there to sign it in.
    const api = createAppClient({ live: false }) as MockApiClient;
    api.mock.setSession(SEEDED_ORGANIZER_ID);

    await expect(api.listStationBoard()).resolves.toEqual(
      expect.objectContaining({ stations: expect.any(Array) }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the session to the service in live mode", async () => {
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

  it("sends every organizer call to the service in live mode", async () => {
    // Section 9's answers, in the order the calls below make them.
    const station = {
      id: "s1",
      label: "Reader 3",
      created_at: "2026-10-01T02:00:00.000Z",
      disabled_at: null,
      game: "passport",
      game_fixed: true,
      booth: "A3",
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: null,
      reader_ok: null,
      last_tap_at: null,
    };
    const passport = {
      station_id: "s1",
      name: "3D Printing Booth",
      location: null,
      points: 1,
      added_at: "2026-10-10T09:00:00.000Z",
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ stations: [station] }))
      .mockResolvedValueOnce(jsonResponse({ station, api_key: "gk_sta_DuY" }, 201))
      .mockResolvedValueOnce(jsonResponse({ station, api_key: "gk_sta_Qm7" }))
      .mockResolvedValueOnce(
        jsonResponse({ station: { ...station, disabled_at: "2026-10-10T09:01:00.000Z" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ station }))
      .mockResolvedValueOnce(jsonResponse({ passport }, 201))
      .mockResolvedValueOnce(jsonResponse({ station }))
      .mockResolvedValueOnce(jsonResponse({ taps: [], next_before_id: null }))
      .mockResolvedValueOnce(jsonResponse({ result: { id: 43, status: "accepted" } }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ total_taps: 0, accepted_taps: 0, unique_participants: 0, stations: [] }),
      )
      .mockResolvedValueOnce(
        new Response("tap_id,client_tap_id\r\n", {
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        }),
      );
    const api = createAppClient({ live: true });

    await expect(api.listStationBoard()).resolves.toEqual({ stations: [station] });
    await expect(api.createStation({ label: "Reader 3" })).resolves.toEqual(
      expect.objectContaining({ api_key: "gk_sta_DuY" }),
    );
    await expect(api.replaceStationKey("s1")).resolves.toEqual(
      expect.objectContaining({ api_key: "gk_sta_Qm7" }),
    );
    await api.disableStation("s1");
    await api.enableStation("s1");
    await expect(api.setStationPassport("s1", { name: "3D Printing Booth" })).resolves.toEqual({
      passport,
    });
    await expect(api.setStationBooth("s1", { booth: "A3" })).resolves.toEqual({ station });
    await api.listTaps({ station_id: "s1" });
    await api.createFallbackTap({ station_id: "s1", user_id: "dev-user-1" });
    await api.stats();
    await expect((await api.exportCsv()).text()).resolves.toBe("tap_id,client_tap_id\r\n");

    const calls = fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method]);
    expect(calls).toEqual([
      ["/api/v1/admin/stations", undefined],
      ["/api/v1/admin/stations", "POST"],
      ["/api/v1/admin/stations/s1/key", "POST"],
      ["/api/v1/admin/stations/s1/disable", "POST"],
      ["/api/v1/admin/stations/s1/enable", "POST"],
      ["/api/v1/admin/stations/s1/passport", "PUT"],
      ["/api/v1/admin/stations/s1/booth", "PUT"],
      ["/api/v1/admin/taps?station_id=s1", undefined],
      ["/api/v1/admin/taps", "POST"],
      ["/api/v1/admin/stats", undefined],
      ["/api/v1/admin/export.csv", undefined],
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    }
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
});
