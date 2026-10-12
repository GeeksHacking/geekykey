import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, NetworkError } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";
import type { ErrorCode } from "@/api/types";

const me = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant" as const },
  points: 0,
  stamps: [],
  recent_taps: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function apiError(promise: Promise<unknown>) {
  return (await promise.catch((error: unknown) => error)) as ApiError;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP client transport", () => {
  it("sends cookie credentials and parses a successful JSON response", async () => {
    fetchMock.mockResolvedValue(response(me));
    const api = createHttpClient();

    await expect(api.me()).resolves.toEqual(me);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses the configured base URL for every request", async () => {
    fetchMock.mockResolvedValue(response(me));
    const api = createHttpClient({ baseUrl: "https://example.test/" });

    await api.me();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/v1/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("does not read a 204 response body", async () => {
    const noBody = {
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new Error("no body")),
    } as unknown as Response;
    fetchMock.mockResolvedValue(noBody);

    await expect(createHttpClient().logout()).resolves.toBeUndefined();
    expect(noBody.json).not.toHaveBeenCalled();
  });

  it("maps structured validation errors and keeps their field paths", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: "validation_failed",
          issues: [{ path: ["user_id"], message: "user_id is invalid" }],
        },
        400,
      ),
    );

    const error = await apiError(
      createHttpClient().createFallbackTap({ station_id: "station-1", user_id: "" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.issues).toEqual([{ path: ["user_id"], message: "user_id is invalid" }]);
  });

  it.each([
    [400, "validation_failed"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "internal_error"],
    [429, "rate_limited"],
    [503, "event_service_unavailable"],
    [500, "internal_error"],
    [418, "internal_error"],
  ])("maps status %i to %s when the error body is unusable", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("<html>proxy error</html>", { status }));

    const error = await apiError(createHttpClient().me());
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  it("uses the status fallback when the JSON error code is unknown", async () => {
    fetchMock.mockResolvedValue(response({ error: "server_mystery" }, 403));

    const error = await apiError(createHttpClient().me());
    expect(error.code).toBe("forbidden");
  });

  it("keeps new contract error codes from the response", async () => {
    fetchMock.mockResolvedValue(response({ error: "event_service_unavailable" }, 503));

    const error = await apiError(createHttpClient().listTaps());
    expect(error.code).toBe("event_service_unavailable");
    expect(error.status).toBe(503);
  });

  it("reads every code from the error body, so a missing set entry cannot hide", async () => {
    // One case per code, all sharing a status the fallback cannot answer. If a code is
    // missing from the body's allowlist the body is ignored and the status map supplies the
    // answer instead, so the code read back is wrong and this fails. The same test exists in
    // apps/geekykey-web, for the same reason: a code can be renamed in the agreement and in
    // the union while the set that decides what to believe quietly drops it.
    const status = 418;
    for (const code of Object.keys(statusFor) as (keyof typeof statusFor)[]) {
      fetchMock.mockResolvedValue(response({ error: code }, status));

      const error = await apiError(createHttpClient().me());

      expect(error, `${code} did not reject`).toBeInstanceOf(ApiError);
      expect(error.code, `${code} was not read from the body`).toBe(code);
    }
  });

  it("ignores malformed issue entries without losing valid ones", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: "validation_failed",
          issues: [null, { path: ["bad", 2], message: "valid" }, { path: ["missing-message"] }],
        },
        400,
      ),
    );

    const error = await apiError(createHttpClient().me());
    expect(error.issues).toEqual([{ path: ["bad", 2], message: "valid" }]);
  });

  it("wraps fetch rejection as a NetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("connection refused"));

    const error = await createHttpClient()
      .me()
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("turns malformed successful JSON into a NetworkError", async () => {
    fetchMock.mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));

    const error = await createHttpClient()
      .me()
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("aborts a request that exceeds the configured timeout", async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const error = await createHttpClient({ requestTimeoutMs: 5 })
      .me()
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });
});

/**
 * Every code in `ErrorCode`, with the status agreement section 2 gives it. `satisfies`
 * makes this exhaustive in both directions: drop a code here, or add one to the union
 * without giving it a status, and the typecheck fails.
 */
const statusFor = {
  validation_failed: 400,
  unauthenticated: 401,
  invalid_token: 401,
  missing_station_key: 401,
  invalid_station_key: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  invalid_event_service_key: 401,
  event_service_unavailable: 503,
  claims_unavailable: 503,
  login_unavailable: 503,
  internal_error: 500,
} as const satisfies Record<ErrorCode, number>;
