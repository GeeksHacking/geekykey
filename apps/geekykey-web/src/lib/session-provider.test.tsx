import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

function setup(prepare?: (api: MockApiClient) => void) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  prepare?.(api);
  const { Providers, queryClient } = createTestProviders(api, { session: true });
  return { api, queryClient, ...renderHook(() => useSession(), { wrapper: Providers }) };
}

describe("SessionProvider", () => {
  it("starts loading and becomes anonymous when /me answers 401", async () => {
    const { result } = setup();
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
  });

  it("signs in, exposes /me, and signs out back to anonymous", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    // Agreement 8.4: no display name, only the ID and the admin flag.
    expect(result.current.me?.user).toEqual({
      id: SEEDED_PARTICIPANT_ID,
      is_geekykey_admin: false,
    });
    await act(async () => {
      await result.current.signOut();
    });
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
  });

  it("marks a GeekyKey admin on the session", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_ADMIN_ID);
    });
    await waitFor(() => expect(result.current.me?.user.is_geekykey_admin).toBe(true));
  });

  it("reports a real failure as an error, not as signed out, and recovers on refresh", async () => {
    const { result } = setup((api) => api.mock.failNext("internal_error"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.me).toBeNull();
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
  });

  it("retries a transient network failure before reporting an error", async () => {
    const { result } = setup((api) => api.mock.failNext("network"));
    await waitFor(() => expect(result.current.status).toBe("anonymous"), { timeout: 5_000 });
  });

  it("keeps authenticated data visible when a background refresh fails", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    api.mock.failNext("internal_error");
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.status).toBe("authenticated");
    expect(result.current.me?.user.id).toBe(SEEDED_PARTICIPANT_ID);
  });

  it("stays authenticated when the /me poll is rate limited", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    api.mock.failNext("rate_limited");
    await act(async () => {
      await result.current.refresh();
    });

    // Stale data, not a signed-out user.
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.status).toBe("authenticated");
    expect(result.current.me?.tokens.length).toBeGreaterThan(0);
  });

  it("reports an error when a first /me load is rate limited with no data", async () => {
    const { result } = setup((api) => api.mock.failNext("rate_limited"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.me).toBeNull();
  });

  it("drops the previous account's cached data the moment sign-in starts", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    // The admin station list belongs to the first account.
    queryClient.setQueryData(queryKeys.stations, { stations: [], event_services: [] });

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.signIn(SEEDED_ADMIN_ID);
    });
    // Nothing from the old account may survive into the new one, even mid-request.
    expect(queryClient.getQueryData(queryKeys.stations)).toBeUndefined();

    await act(async () => {
      await pending;
    });
    await waitFor(() => expect(result.current.me?.user.id).toBe(SEEDED_ADMIN_ID));
    expect(result.current.me?.user.is_geekykey_admin).toBe(true);
  });

  it("leaves no stale identity data when sign-in itself fails", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    queryClient.setQueryData(queryKeys.stations, { stations: [], event_services: [] });
    api.mock.failNext("internal_error");

    await act(async () => {
      await expect(result.current.signIn(SEEDED_ADMIN_ID)).rejects.toBeDefined();
    });

    // A failed sign-in must not leave the old account's data visible.
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.stations)).toBeUndefined();
  });

  it("clears identity queries even when logout fails", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    // Identity-scoped cache: the admin station list, which must not survive to the next person.
    queryClient.setQueryData(queryKeys.stations, { stations: [], event_services: [] });
    api.mock.failNext("internal_error");

    await expect(result.current.signOut()).rejects.toBeDefined();

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    // The failure must not leave the previous account's data on screen.
    expect(queryClient.getQueryData(queryKeys.stations)).toBeUndefined();
  });

  it("clears identity queries the moment logout starts, before the request settles", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    queryClient.setQueryData(queryKeys.stations, { stations: [], event_services: [] });

    // Not awaited: the point is what is already gone while the request is still in flight.
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.signOut();
    });
    expect(queryClient.getQueryData(queryKeys.stations)).toBeUndefined();

    await act(async () => {
      await pending;
    });
    expect(result.current.me).toBeNull();
    void api;
  });

  it("clears the session when an identity-scoped request returns 401", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    queryClient.setQueryData(queryKeys.stations, { stations: [] });

    api.mock.failNext("unauthenticated");
    await expect(api.listStations()).rejects.toBeDefined();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.stations)).toBeUndefined();
  });

  it("keeps a 403 available to a role gate", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_ADMIN_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    api.mock.failNext("forbidden");
    await expect(api.listStations()).rejects.toBeDefined();
    await waitFor(() => expect(result.current.authorizationError).toBeDefined());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.authorizationError).toBeUndefined();
  });
});
