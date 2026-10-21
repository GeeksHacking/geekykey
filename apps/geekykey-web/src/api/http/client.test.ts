import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, AUTH_ERROR_EVENT } from "@/api/errors";
import type { ErrorCode } from "@/api/types";
import { createHttpClient } from "@/api/http/client";

/**
 * fetch is stubbed rather than a real server: this is about the transport's contract, which
 * is a path, a body, and the ApiError it turns a non-2xx into.
 */
interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(respond: (call: number) => Response) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return respond(calls.length - 1);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geekykey-web http client", () => {
  it("sends credentialed requests, so the HttpOnly cookie travels", async () => {
    const { calls } = stubFetch(() =>
      json({ user: { id: "dev-user-1", is_geekykey_admin: false }, tokens: [], events: [] }),
    );
    const api = createHttpClient();

    await api.me();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.credentials).toBe("include");
  });

  it("builds the token paths the agreement names", async () => {
    const { calls } = stubFetch(() =>
      json({
        token: { uid: "04A1B2C3D4E5F6", owner: "nobody", claimed_at: null, owner_id: null },
      }),
    );
    const api = createHttpClient();

    await api.getToken("04A1B2C3D4E5F6");
    expect(calls[0]?.url).toBe("/api/v1/tokens/04A1B2C3D4E5F6");
  });

  it("posts the claim and deletes the release with owner_id", async () => {
    const { calls } = stubFetch((call) =>
      call === 0
        ? json({ token: { uid: "04A1B2C3D4E5F6", claimed_at: null } })
        : new Response(null, { status: 204 }),
    );
    const api = createHttpClient();

    await api.claimToken("04A1B2C3D4E5F6");
    expect(calls[0]?.url).toBe("/api/v1/tokens/04A1B2C3D4E5F6/claim");
    expect(calls[0]?.init?.method).toBe("POST");

    await api.releaseToken("04A1B2C3D4E5F6", "p_1041");
    expect(calls[1]?.init?.method).toBe("DELETE");
    expect(calls[1]?.url).toBe("/api/v1/tokens/04A1B2C3D4E5F6?owner_id=p_1041");
  });

  it("sends no owner_id when the owner releases their own token", async () => {
    const { calls } = stubFetch(() => new Response(null, { status: 204 }));
    const api = createHttpClient();

    await api.releaseToken("04A1B2C3D4E5F6");

    expect(calls[0]?.url).toBe("/api/v1/tokens/04A1B2C3D4E5F6");
  });

  it("builds the login URL without sending a request", () => {
    const { calls } = stubFetch(() => json({}));
    const api = createHttpClient();

    expect(api.loginUrl("/t/04A1B2C3D4E5F6")).toBe("/auth/login?return_to=%2Ft%2F04A1B2C3D4E5F6");
    expect(calls).toHaveLength(0);
  });

  it("turns a login_unavailable body into that code", async () => {
    // Agreement 0.4 section 7.2, POST /auth/firebase: Google's keys could not be fetched.
    stubFetch(() => json({ error: "login_unavailable" }, 503));
    const api = createHttpClient();

    await expect(api.me()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      code: "login_unavailable",
    });
  });

  it("turns an invalid_token body into that code", async () => {
    // Agreement 0.4 section 7.2: the Firebase ID token cannot be trusted.
    stubFetch(() => json({ error: "invalid_token" }, 401));
    const api = createHttpClient();

    await expect(api.me()).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "invalid_token",
    });
  });

  it("turns a claims_unavailable body into that code", async () => {
    stubFetch(() => json({ error: "claims_unavailable" }, 503));
    const api = createHttpClient();

    await expect(api.getToken("04A1B2C3D4E5F6")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      code: "claims_unavailable",
    });
  });

  it("falls back to claims_unavailable for a bare 503", async () => {
    // A 503 with no readable body still means the claims stand-in or the Portal.
    stubFetch(() => new Response("upstream down", { status: 503 }));
    const api = createHttpClient();

    await expect(api.me()).rejects.toMatchObject({ status: 503, code: "claims_unavailable" });
  });

  it("gives a 401 on the login invalid_token, not a lost session", async () => {
    // Agreement 7.2: the login answers 401 invalid_token. Every other 401 is
    // unauthenticated, which the session provider reads as a signed-out user.
    stubFetch(() => new Response("not json", { status: 401 }));
    const api = createHttpClient();

    await expect(api.firebaseLogin("id-token")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "invalid_token",
    });
  });

  it("gives a 503 on the login login_unavailable, not the claims stand-in", async () => {
    // Agreement 7.2: the login answers 503 login_unavailable, so Google's keys could not be
    // fetched and the token may be fine.
    stubFetch(() => new Response("not json", { status: 503 }));
    const api = createHttpClient();

    await expect(api.firebaseLogin("id-token")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      code: "login_unavailable",
    });
  });

  it("keeps the code a readable body on the login says", async () => {
    // The Worker in front of the screens answers 503 service_unavailable under /api and
    // /auth (agreement 2), and the service's own codes are the truth, so a body the client
    // can read wins over the endpoint's table.
    stubFetch(() => json({ error: "unauthenticated" }, 401));
    const api = createHttpClient();

    await expect(api.firebaseLogin("id-token")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "unauthenticated",
    });
  });

  it("does not publish the auth error for a refused token", async () => {
    // publishAuthError fires on unauthenticated and forbidden, and the session provider
    // reads it as a signed-out user. A refused token is a failed sign-in, not a lost
    // session, so the person stays signed in and can try again.
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener(AUTH_ERROR_EVENT, listener);
    try {
      stubFetch(() => new Response("not json", { status: 401 }));
      await createHttpClient()
        .firebaseLogin("id-token")
        .catch(() => undefined);
    } finally {
      window.removeEventListener(AUTH_ERROR_EVENT, listener);
    }

    expect(seen).toEqual([]);
  });

  it("turns a transport failure into a NetworkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("failed to fetch");
      }),
    );
    const api = createHttpClient();

    await expect(api.me()).rejects.toMatchObject({ name: "NetworkError" });
  });

  it("turns a 200 that is not the expected shape into a NetworkError", async () => {
    stubFetch(() =>
      json({ token: { uid: "04A1B2C3D4E5F6", owner: "maybe", claimed_at: null, owner_id: null } }),
    );
    const api = createHttpClient();

    await expect(api.getToken("04A1B2C3D4E5F6")).rejects.toMatchObject({ name: "NetworkError" });
  });

  it("has no station methods, since section 10 is empty in 0.3", () => {
    const api = createHttpClient() as unknown as Record<string, unknown>;
    for (const gone of [
      "listStations",
      "createStation",
      "replaceStationKey",
      "setStationLink",
      "disableStation",
      "enableStation",
    ]) {
      expect(api[gone], `${gone} still exists`).toBeUndefined();
    }
  });

  it("reads every code from the error body, so a missing set entry cannot hide", async () => {
    // One case per code, all sharing a status the fallback cannot answer. If a code is
    // missing from ERROR_CODES the body is ignored and the status map supplies the answer
    // instead, so the code read back is wrong and this fails.
    const status = 418;
    for (const code of Object.keys(statusFor) as ErrorCode[]) {
      stubFetch(() => json({ error: code }, status));
      const api = createHttpClient();
      try {
        await api.me();
        throw new Error(`${code} did not reject`);
      } catch (error) {
        expect((error as ApiError).code, `${code} was not read from the body`).toBe(code);
      }
      vi.unstubAllGlobals();
    }
  });
});

/** The codes the agreement's status table defines for the endpoints this app calls. */
const statusFor: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  invalid_token: 401,
  forbidden: 403,
  not_found: 404,
  token_taken: 409,
  token_limit_reached: 409,
  rate_limited: 429,
  claims_unavailable: 503,
  login_unavailable: 503,
  internal_error: 500,
};
