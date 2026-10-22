import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { MeResponse } from "@/api/types";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

const { signOutOfFirebase } = vi.hoisted(() => ({ signOutOfFirebase: vi.fn() }));

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase }));

beforeEach(() => {
  signOutOfFirebase.mockReset();
  signOutOfFirebase.mockResolvedValue(undefined);
});

function setup(prepare?: (api: MockApiClient) => void, loginLink?: string) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  prepare?.(api);
  const { Providers, queryClient } = createTestProviders(api, { session: true, loginLink });
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
    queryClient.setQueryData(queryKeys.stationBoard, { stations: [] });
    api.mock.failNext("internal_error");

    await expect(result.current.signOut()).rejects.toBeDefined();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.stationBoard)).toBeUndefined();
  });

  it("keeps a 403 available to the role gate", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    await act(async () => {
      await result.current.signIn(SEEDED_ORGANIZER_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    api.mock.failNext("forbidden");
    await expect(api.listStationBoard()).rejects.toBeDefined();
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
    queryClient.setQueryData(queryKeys.stationBoard, { stations: [] });

    api.mock.failNext("unauthenticated");
    await expect(api.listStationBoard()).rejects.toBeDefined();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.me).toBeNull();
    expect(queryClient.getQueryData(queryKeys.stationBoard)).toBeUndefined();
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
    let refuseThePoll!: (reason: unknown) => void;
    const lateAnswer = new Promise<MeResponse>((_, reject) => {
      refuseThePoll = reject;
    });
    const realMe = api.me.bind(api);
    let theNextCallIsTheLateOne = false;
    vi.spyOn(api, "me").mockImplementation(async () => {
      if (theNextCallIsTheLateOne) {
        theNextCallIsTheLateOne = false;
        return lateAnswer;
      }
      return realMe();
    });

    let signIn: Promise<MeResponse> | undefined;
    act(() => {
      signIn = result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    // A poll goes out now, while the sign-in is still in flight.
    theNextCallIsTheLateOne = true;
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
      refuseThePoll(new ApiError(401, "unauthenticated"));
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
    let answerThePoll!: (answer: MeResponse) => void;
    const lateAnswer = new Promise<MeResponse>((resolve) => {
      answerThePoll = resolve;
    });
    const realMe = api.me.bind(api);
    const meBeforeTheSignOut = await realMe();
    let theNextCallIsTheLateOne = false;
    vi.spyOn(api, "me").mockImplementation(async () => {
      if (theNextCallIsTheLateOne) {
        theNextCallIsTheLateOne = false;
        return lateAnswer;
      }
      return realMe();
    });

    let signOut: Promise<void> | undefined;
    act(() => {
      signOut = result.current.signOut();
    });
    // A poll goes out now, while the sign-out is still in flight.
    theNextCallIsTheLateOne = true;
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
      answerThePoll(meBeforeTheSignOut);
    });
    // The answer has been dealt with, one way or the other.
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.me)?.fetchStatus).toBe("idle"));

    // The person stays signed out: the answer was asked for before the sign-out, so it
    // says nothing about the session that is now in place.
    expect(result.current.status).toBe("anonymous");
    expect(result.current.me).toBeNull();
  });
});

describe("SessionProvider with a login link", () => {
  it("logs in from the link before it reads /me", async () => {
    // Agreement 7.4: send the link, then GET /api/v1/me as usual. A /me read first would
    // answer for whoever the browser was before.
    const calls: string[] = [];
    const { result } = setup((api) => {
      const { loginLink, me } = api;
      vi.spyOn(api, "loginLink").mockImplementation((link) => {
        calls.push("loginLink");
        return loginLink(link);
      });
      vi.spyOn(api, "me").mockImplementation(() => {
        calls.push("me");
        return me();
      });
    }, "mock");

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.me?.user.id).toBe(SEEDED_PARTICIPANT_ID);
    expect(result.current.loginLinkError).toBeUndefined();
    expect(calls).toEqual(["loginLink", "me"]);
  });

  it("replaces the session the browser already had", async () => {
    const { result } = setup((api) => api.mock.setSession(SEEDED_ORGANIZER_ID), "mock");

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.me?.user.id).toBe(SEEDED_PARTICIPANT_ID);
  });

  it("keeps the existing session when the link has expired, and keeps the error", async () => {
    // Agreement 7.4: a link that fails leaves the existing session as it was.
    const { result } = setup((api) => api.mock.setSession(SEEDED_ORGANIZER_ID), "expired-link");

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.me?.user.id).toBe(SEEDED_ORGANIZER_ID);
    expect(result.current.loginLinkError).toMatchObject({ code: "invalid_login_link" });
  });

  it("is signed out, with the error, when an expired link meets no session", async () => {
    const { result } = setup(undefined, "expired-link");

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.loginLinkError).toMatchObject({ code: "invalid_login_link" });
  });

  it("sends the link once, however often /me is read", async () => {
    const { api, result } = setup((api) => vi.spyOn(api, "loginLink"), "mock");
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    await act(async () => {
      await result.current.refresh();
    });

    expect(api.loginLink).toHaveBeenCalledTimes(1);
  });

  it("forgets the link's error once someone signs in", async () => {
    const { result } = setup(undefined, "expired-link");
    await waitFor(() => expect(result.current.loginLinkError).toBeDefined());

    await act(async () => {
      await result.current.signIn(SEEDED_PARTICIPANT_ID);
    });

    expect(result.current.loginLinkError).toBeUndefined();
  });

  it("sends nothing when the address had no link", async () => {
    const { api, result } = setup((api) => vi.spyOn(api, "loginLink"));

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(api.loginLink).not.toHaveBeenCalled();
    expect(result.current.loginLinkError).toBeUndefined();
  });

  it("keeps the person signed out when the sign-in fails and a late /me lands after it", async () => {
    const { api, queryClient, result } = setup();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    // A shared browser: the organiser is signed in already.
    await act(async () => {
      await result.current.signIn(SEEDED_ORGANIZER_ID);
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    // The next sign-in fails, like a Firebase ID token the service refuses.
    const realDevLogin = api.devLogin.bind(api);
    vi.spyOn(api, "devLogin").mockImplementation(async (userId: string) => {
      await realDevLogin(userId);
      throw new ApiError(401, "invalid_token");
    });

    // A /me goes out while the sign-in is in flight, and answers with the old account.
    let answerThePoll!: (answer: MeResponse) => void;
    const lateAnswer = new Promise<MeResponse>((resolve) => {
      answerThePoll = resolve;
    });
    const realMe = api.me.bind(api);
    const meBeforeTheSignIn = await realMe();
    let theNextCallIsTheLateOne = false;
    vi.spyOn(api, "me").mockImplementation(async () => {
      if (theNextCallIsTheLateOne) {
        theNextCallIsTheLateOne = false;
        return lateAnswer;
      }
      return realMe();
    });

    let signIn: Promise<MeResponse> | undefined;
    act(() => {
      signIn = result.current.signIn(SEEDED_PARTICIPANT_ID);
    });
    // A poll goes out now, while the sign-in is still in flight.
    theNextCallIsTheLateOne = true;
    act(() => {
      void result.current.refresh();
    });
    await act(async () => {
      await signIn?.catch(() => undefined);
    });

    // The poll's answer lands now, after the sign-in has failed.
    await act(async () => {
      answerThePoll(meBeforeTheSignIn);
    });
    // The answer has been dealt with, one way or the other.
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.me)?.fetchStatus).toBe("idle"));

    // The person stays signed out: a failed sign-in leaves the screens signed out, and
    // the answer was asked for before it failed.
    expect(result.current.status).toBe("anonymous");
    expect(result.current.me).toBeNull();
  });
});
