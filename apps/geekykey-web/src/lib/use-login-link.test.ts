import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { useLoginLink } from "@/lib/use-login-link";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

/**
 * The link the mock answers: the Event screens' local address with the one link
 * their mock accepts.
 */
const MOCK_LINK_URL = "http://localhost:5173/#login=mock";

let api: MockApiClient;
let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  location = stubLocation();
});

afterEach(() => {
  location.restore();
});

/**
 * The mutation's state lands a tick after the promise settles, so a test that looks at
 * it has to wait for it.
 */
async function settled(result: { current: { status: string } }) {
  await waitFor(() => expect(result.current.status).toBe("success"));
}

describe("useLoginLink", () => {
  it("asks the service for a link and opens the url it answers", async () => {
    const create = vi.spyOn(api, "createLoginLink");
    const { Providers } = createTestProviders(api);
    const { result } = renderHook(() => useLoginLink(), { wrapper: Providers });

    await act(async () => {
      await result.current.mutateAsync("showcase");
    });
    await settled(result);

    expect(create).toHaveBeenCalledWith("showcase");
    expect(location.assign).toHaveBeenCalledWith(MOCK_LINK_URL);
  });

  it("keeps nothing of the link, which works once and expires in a minute", async () => {
    const { Providers } = createTestProviders(api);
    const { result } = renderHook(() => useLoginLink(), { wrapper: Providers });

    await act(async () => {
      await result.current.mutateAsync("showcase");
    });
    await settled(result);

    // The url is opened and dropped. The mutation carries no answer, so no screen can
    // hold on to a link that stops working.
    expect(result.current.data).toBeUndefined();
  });

  it("asks /me again when the service says the event is not there", async () => {
    // 8.6 answers not_found for an event_id that isn't in /me's events, so /me is stale
    // and only a fresh one settles which events there are.
    const me = vi.spyOn(api, "me");
    const { Providers } = createTestProviders(api, { session: true });
    const { result } = renderHook(() => useLoginLink(), { wrapper: Providers });
    await waitFor(() => expect(me).toHaveBeenCalled());
    const before = me.mock.calls.length;

    await act(async () => {
      await expect(result.current.mutateAsync("no-such-event")).rejects.toThrow();
    });

    await waitFor(() => expect(me.mock.calls.length).toBeGreaterThan(before));
  });

  it("leaves /me alone when the failure is something else, and opens nothing", async () => {
    const me = vi.spyOn(api, "me");
    const { Providers } = createTestProviders(api, { session: true });
    const { result } = renderHook(() => useLoginLink(), { wrapper: Providers });
    await waitFor(() => expect(me).toHaveBeenCalled());
    const before = me.mock.calls.length;

    vi.spyOn(api, "createLoginLink").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    await act(async () => {
      await expect(result.current.mutateAsync("showcase")).rejects.toThrow();
    });

    expect(me.mock.calls.length).toBe(before);
    expect(location.assign).not.toHaveBeenCalled();
  });
});
