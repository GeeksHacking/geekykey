import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, NetworkError } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";

const me = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant" as const },
  tokens: [],
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

  it("preserves a 2xx pairing response and derives created from its status", async () => {
    const body = { token: { uid: "04A1B2C3D4E5F6", paired_at: "2026-09-24T00:00:00.000Z" } };
    fetchMock.mockResolvedValue(response(body, 201));

    await expect(createHttpClient().pairToken("04:a1:b2:c3:d4:e5:f6")).resolves.toEqual({
      token: body.token,
      created: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tokens/pair",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "04:a1:b2:c3:d4:e5:f6" }),
        credentials: "include",
      }),
    );
  });

  it("maps an idempotent 200 pairing response to created false", async () => {
    const body = { token: { uid: "04A1B2C3D4E5F6", paired_at: "2026-09-24T00:00:00.000Z" } };
    fetchMock.mockResolvedValue(response(body, 200));

    await expect(createHttpClient().pairToken("04A1B2C3D4E5F6")).resolves.toEqual({
      token: body.token,
      created: false,
    });
  });

  it("maps structured validation errors and keeps their field paths", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: "validation_failed",
          issues: [{ path: ["uid"], message: "uid is invalid" }],
        },
        400,
      ),
    );

    const error = await apiError(createHttpClient().pairToken("bad"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.issues).toEqual([{ path: ["uid"], message: "uid is invalid" }]);
  });

  it.each([
    [400, "validation_failed"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "uid_already_paired"],
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
