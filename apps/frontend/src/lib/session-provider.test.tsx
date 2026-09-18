import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

function setup(prepare?: (api: MockApiClient) => void) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  prepare?.(api);
  const { Providers } = createTestProviders(api, { session: true });
  return { api, ...renderHook(() => useSession(), { wrapper: Providers }) };
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

  it("refresh picks up a change made behind its back", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const before = result.current.me?.tokens.length ?? 0;
    await api.pairToken("04:AA:BB:CC:DD:EE:01");
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.me?.tokens).toHaveLength(before + 1));
  });
});
