import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { MeResponse } from "@/api/types";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

const { signOutOfFirebase, savedUserIdToken } = vi.hoisted(() => ({
  signOutOfFirebase: vi.fn(),
  savedUserIdToken: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase, savedUserIdToken }));

beforeEach(() => {
  signOutOfFirebase.mockReset();
  signOutOfFirebase.mockResolvedValue(undefined);
  // Firebase remembers nobody unless a test says otherwise.
  savedUserIdToken.mockReset();
  savedUserIdToken.mockResolvedValue(null);
});

/** A token the seeded participant owns, used as an identity-scoped cache key. */
const SOME_UID = "04A1B2C3D4E5F6";

/** Any shape, as a cached value: these tests only care that the key gets cleared. */
const cachedToken = { uid: SOME_UID, owner: "you", claimed_at: null, owner_id: null };

function setup(prepare?: (api: MockApiClient) => void) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  prepare?.(api);
  const { Providers, queryClient } = createTestProviders(api, { session: true });
  // Every status the screens saw, so a test can tell that the login never showed.
  const statuses: string[] = [];
  const rendered = renderHook(
    () => {
      const session = useSession();
      statuses.push(session.status);
      return session;
    },
    { wrapper: Providers },
  );
  return { api, queryClient, statuses, ...rendered };
}

/**
 * Holds the /me the provider sends after `holdTheNextOne()`, so a test can land its answer
 * after a sign-in or a sign-out has finished. Every other /me reaches the mock as usual.
 */
function holdNextMe(api: MockApiClient) {
  let answer!: (me: MeResponse) => void;
  let refuse!: (reason: unknown) => void;
  const held = new Promise<MeResponse>((resolve, reject) => {
    answer = resolve;
    refuse = reject;
  });
  const realMe = api.me.bind(api);
  let holding = false;
  vi.spyOn(api, "me").mockImplementation(async () => {
    if (!holding) return realMe();
    holding = false;
    return held;
  });
  return { holdTheNextOne: () => (holding = true), answer, refuse, realMe };
}

describe("SessionProvider", () => {
  it("starts loading and becomes anonymous when /me answers 401", async () => {
    const { result } = setup();
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
  });

  describe("logging a returning user in again (agreement 7.2)", () => {
    it("logs in with Firebase's saved user when /me answers 401, without showing the login", async () => {
      savedUserIdToken.mockResolvedValue("saved-id-token");
      const { api, result, statuses } = setup((api) => vi.spyOn(api, "firebaseLogin"));

      await waitFor(() => expect(result.current.status).toBe("authenticated"));

      expect(api.firebaseLogin).toHaveBeenCalledWith("saved-id-token");
      expect(result.current.me?.user.id).toBe(SEEDED_PARTICIPANT_ID);
      // "anonymous" is what sends a screen to the login.
      expect(statuses).not.toContain("anonymous");
    });

    it("shows the login when that login fails", async () => {
      savedUserIdToken.mockResolvedValue("saved-id-token");
      const { result } = setup((api) =>
        vi.spyOn(api, "firebaseLogin").mockRejectedValue(new ApiError(401, "invalid_token")),
      );

      await waitFor(() => expect(result.current.status).toBe("anonymous"));
      expect(result.current.me).toBeNull();
    });

    it("shows the login when Firebase cannot say who it remembers", async () => {
      savedUserIdToken.mockRejectedValue(new Error("firebase is down"));
      const { result } = setup();

      await waitFor(() => expect(result.current.status).toBe("anonymous"));
    });

    it("logs in again when a session runs out partway through", async () => {
      const { api, result, statuses } = setup();
      await waitFor(() => expect(result.current.status).toBe("anonymous"));
      await act(async () => {
        await result.current.signIn(SEEDED_PARTICIPANT_ID);
      });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      statuses.length = 0;

      // The service's 12-hour session ends, and Firebase still has the user.
      savedUserIdToken.mockResolvedValue("saved-id-token");
      api.mock.setSession(null);
      api.mock.failNext("unauthenticated");
      await expect(api.getToken(SOME_UID)).rejects.toBeDefined();

      await waitFor(() => expect(savedUserIdToken).toHaveBeenCalled());
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      expect(statuses).not.toContain("anonymous");
    });

    it("does not log the user straight back in after they sign out", async () => {
      const { api, result } = setup();
      await waitFor(() => expect(result.current.status).toBe("anonymous"));
      await act(async () => {
        await result.current.signIn(SEEDED_PARTICIPANT_ID);
      });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));

      // Firebase's sign-out failed, so it still remembers the user.
      signOutOfFirebase.mockRejectedValue(new Error("firebase is down"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      savedUserIdToken.mockResolvedValue("saved-id-token");
      const firebaseLogin = vi.spyOn(api, "firebaseLogin");

      await act(async () => {
        await result.current.signOut();
      });
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.status).toBe("anonymous");
      expect(firebaseLogin).not.toHaveBeenCalled();
    });

    it("leaves the service signed out when a sign-out starts while the login is in flight", async () => {
      // Firebase remembers the user while the service's /me answers 401, so the provider
      // starts agreement 7.2's login again.
      savedUserIdToken.mockResolvedValue("saved-id-token");

      // Hold POST /auth/firebase in flight, as a slow network would.
      let releaseLogin!: () => void;
      const loginGate = new Promise<void>((resolve) => {
        releaseLogin = resolve;
      });

      const { api, result } = setup((api) => {
        const realFirebaseLogin = api.firebaseLogin.bind(api);
        vi.spyOn(api, "firebaseLogin").mockImplementation(async (idToken: string) => {
          await loginGate;
          return realFirebaseLogin(idToken);
        });
      });
      const logout = vi.spyOn(api, "logout");

      await waitFor(() => expect(api.firebaseLogin).toHaveBeenCalledWith("saved-id-token"));

      let signOut!: Promise<void>;
      act(() => {
        signOut = result.current.signOut();
      });
      // The sign-out has started and Firebase is signed out, but the service must not be
      // told to log out while the login can still set the cookie again.
      await waitFor(() => expect(signOutOfFirebase).toHaveBeenCalled());
      expect(logout).not.toHaveBeenCalled();

      await act(async () => {
        releaseLogin();
        await signOut;
      });

      // The login landed while the sign-out was running. The service is signed out, and
      // the next /me says so.
      expect(logout).toHaveBeenCalledTimes(1);
      await expect(api.me()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
      // The provider's own next read must not sign the person back in either.
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => expect(result.current.status).toBe("anonymous"));
      expect(result.current.me).toBeNull();
    });
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
    queryClient.setQueryData(queryKeys.token(SOME_UID), { token: cachedToken });

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.signIn(SEEDED_ADMIN_ID);
    });
    // Nothing from the old account may survive into the new one, even mid-request.
    expect(queryClient.getQueryData(queryKeys.token(SOME_UID))).toBeUndefined();

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
    queryClient.setQueryData(queryKeys.token(SOME_UID), { token: cachedToken });
    api.mock.failNext("internal_error");

    await act(async () => {
      await expect(result.current.signIn(SEEDED_ADMIN_ID)).rejects.toBeDefined();
    });

    // A failed sign-in must not leave the old account's data visible.
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.token(SOME_UID))).toBeUndefined();
  });

  it("signs out of Firebase before it signs out of the service", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    const order: string[] = [];
    signOutOfFirebase.mockImplementation(async () => {
      order.push("firebase");
    });
    vi.spyOn(api, "logout").mockImplementation(async () => {
      order.push("service");
    });

    await act(async () => {
      await result.current.signOut();
    });

    // Firebase goes first, because the screens sign a returning user in again whenever
    // Firebase still has them.
    expect(order).toEqual(["firebase", "service"]);
  });

  it("still signs out of the service when Firebase's sign-out fails", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    signOutOfFirebase.mockRejectedValue(new Error("firebase is down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const logout = vi.spyOn(api, "logout");

    await act(async () => {
      await result.current.signOut();
    });

    // The service's cookie is the session, so a Firebase failure must not stop the
    // sign-out. It is logged, not shown to the user.
    expect(logout).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
  });

  it("clears identity queries even when logout fails", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    // Identity-scoped cache: the admin station list, which must not survive to the next person.
    queryClient.setQueryData(queryKeys.token(SOME_UID), { token: cachedToken });
    api.mock.failNext("internal_error");

    await expect(result.current.signOut()).rejects.toBeDefined();

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    // The failure must not leave the previous account's data on screen.
    expect(queryClient.getQueryData(queryKeys.token(SOME_UID))).toBeUndefined();
  });

  it("clears identity queries the moment logout starts, before the request settles", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    queryClient.setQueryData(queryKeys.token(SOME_UID), { token: cachedToken });

    // Not awaited: the point is what is already gone while the request is still in flight.
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.signOut();
    });
    expect(queryClient.getQueryData(queryKeys.token(SOME_UID))).toBeUndefined();

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
    queryClient.setQueryData(queryKeys.token(SOME_UID), { token: cachedToken });

    // The cookie has gone, so /me answers 401 too.
    api.mock.setSession(null);
    api.mock.failNext("unauthenticated");
    await expect(api.getToken("04A1B2C3D4E5F6")).rejects.toBeDefined();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.token(SOME_UID))).toBeUndefined();
  });

  it("keeps a 403 available to a role gate", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_ADMIN_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    api.mock.failNext("forbidden");
    // Any identity-scoped request can answer 403; the claim is one of them.
    await expect(api.claimToken("04E5F7091B3D")).rejects.toBeDefined();
    await waitFor(() => expect(result.current.authorizationError).toBeDefined());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.authorizationError).toBeUndefined();
  });

  it("keeps the session when a /me answer from before the sign-in lands after it", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    // The sign-in waits here, so a /me can go out while the sign-in is in flight.
    let signInCanFinish!: () => void;
    const signInGate = new Promise<void>((resolve) => {
      signInCanFinish = resolve;
    });
    const realDevLogin = api.devLogin.bind(api);
    vi.spyOn(api, "devLogin").mockImplementation(async (userId: string) => {
      await signInGate;
      return realDevLogin(userId);
    });

    // A /me that goes out now answers 401, because the cookie is not set yet. It lands
    // when the test says so.
    const poll = holdNextMe(api);

    let signIn: Promise<MeResponse> | undefined;
    act(() => {
      signIn = result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    // A poll goes out now, while the sign-in is still in flight.
    poll.holdTheNextOne();
    act(() => {
      void result.current.refresh();
    });
    signInCanFinish();
    await act(async () => {
      await signIn;
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    // The poll's 401 lands now, after the sign-in has finished.
    await act(async () => {
      poll.refuse(new ApiError(401, "unauthenticated"));
    });
    // The answer has been dealt with, one way or the other.
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.me)?.fetchStatus).toBe("idle"));

    // The person stays signed in: the answer was asked for before the sign-in, so it
    // says nothing about the session that is now in place.
    expect(result.current.status).toBe("authenticated");
    expect(result.current.me?.user.id).toBe(SEEDED_PARTICIPANT_ID);
  });

  it("keeps the person signed out when a /me answer from before the sign-out lands after it", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    // The sign-out waits here, so a /me can go out while the sign-out is in flight.
    let signOutCanFinish!: () => void;
    const signOutGate = new Promise<void>((resolve) => {
      signOutCanFinish = resolve;
    });
    const realLogout = api.logout.bind(api);
    vi.spyOn(api, "logout").mockImplementation(async () => {
      await signOutGate;
      return realLogout();
    });

    // A /me that goes out now still carries the cookie, so it answers with the person
    // who was signed in. It lands when the test says so.
    const poll = holdNextMe(api);
    const meBeforeTheSignOut = await poll.realMe();

    let signOut: Promise<void> | undefined;
    act(() => {
      signOut = result.current.signOut();
    });
    // A poll goes out now, while the sign-out is still in flight.
    poll.holdTheNextOne();
    act(() => {
      void result.current.refresh();
    });
    signOutCanFinish();
    await act(async () => {
      await signOut;
    });
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    // The poll's answer lands now, after the sign-out has finished.
    await act(async () => {
      poll.answer(meBeforeTheSignOut);
    });
    // The answer has been dealt with, one way or the other.
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.me)?.fetchStatus).toBe("idle"));

    // The person stays signed out: the answer was asked for before the sign-out, so it
    // says nothing about the session that is now in place.
    expect(result.current.status).toBe("anonymous");
    expect(result.current.me).toBeNull();
  });

  it("keeps the person signed out when the sign-in fails and a late /me lands after it", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    // A shared browser: the admin is signed in already.
    await act(async () => {
      await result.current.signIn(SEEDED_ADMIN_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    // The next sign-in fails, like a Firebase ID token the service refuses.
    const realDevLogin = api.devLogin.bind(api);
    vi.spyOn(api, "devLogin").mockImplementation(async (userId: string) => {
      await realDevLogin(userId);
      throw new ApiError(401, "invalid_token");
    });

    // A /me goes out while the sign-in is in flight, and answers with the old account.
    const poll = holdNextMe(api);
    const meBeforeTheSignIn = await poll.realMe();

    let signIn: Promise<MeResponse> | undefined;
    act(() => {
      signIn = result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    // A poll goes out now, while the sign-in is still in flight.
    poll.holdTheNextOne();
    act(() => {
      void result.current.refresh();
    });
    await act(async () => {
      await signIn?.catch(() => undefined);
    });

    // The poll's answer lands now, after the sign-in has failed.
    await act(async () => {
      poll.answer(meBeforeTheSignIn);
    });
    // The answer has been dealt with, one way or the other.
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.me)?.fetchStatus).toBe("idle"));

    // The person stays signed out: a failed sign-in leaves the screens signed out, and
    // the answer was asked for before it failed.
    expect(result.current.status).toBe("anonymous");
    expect(result.current.me).toBeNull();
  });
});
