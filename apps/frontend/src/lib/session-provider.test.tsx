import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
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
    expect(result.current.me?.user.display_name).toBe("Alex Tan");
    await act(async () => {
      await result.current.signOut();
    });
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
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

  it("clears identity queries even when logout fails", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    queryClient.setQueryData(queryKeys.stations, { stations: [] });
    api.mock.failNext("internal_error");

    await expect(result.current.signOut()).rejects.toBeDefined();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.stations)).toBeUndefined();
  });

  it("keeps a 403 available to the role gate", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_ORGANIZER_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    api.mock.failNext("forbidden");
    await expect(api.listStations()).rejects.toBeDefined();
    await waitFor(() => expect(result.current.authorizationError).toBeDefined());
    expect(result.current.me?.user.role).toBe("organizer");
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.authorizationError).toBeUndefined();
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

  it("stays authenticated when a /me poll is rate limited", async () => {
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

    // Participant screens keep the stamps and points they already had: a 429 on a
    // background poll is stale data, not a signed-out user.
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.status).toBe("authenticated");
    expect(result.current.me?.user.id).toBe(SEEDED_PARTICIPANT_ID);
    expect(result.current.me?.user.display_name).toBe("Alex Tan");
  });

  it("reports an error when a first /me load is rate limited with no data", async () => {
    const { result } = setup((api) => api.mock.failNext("rate_limited"));

    // Nothing to keep, so the usual error path applies rather than a quiet note.
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.me).toBeNull();
  });

  it("refresh picks up a change made behind its back", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const user = api.mock.data.users.find((item) => item.id === SEEDED_PARTICIPANT_ID);
    user!.display_name = "Alex Updated";
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.me?.user.display_name).toBe("Alex Updated");
  });
});
