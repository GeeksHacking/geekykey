import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  parseClaimResponse,
  parseCreateStationResponse,
  parseListStationsResponse,
  parseMeResponse,
  parseReplaceStationKeyResponse,
  parseStationResponse,
  parseTokenLookupResponse,
} from "@/api/schemas";
import type { ApiIssue, ErrorCode } from "@/api/types";

export interface HttpClientOptions {
  /** Prefix for every path. Empty in dev: Vite proxies /api and /auth to the backend on :8000. */
  baseUrl?: string;
  /** Maximum time to wait for one HTTP exchange. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/*
  The real client, copied from apps/frontend so both apps throw the same ApiError
  and NetworkError types and a screen cannot tell them apart. Which methods the app
  actually calls through here is decided in src/api/create-client.ts; nothing is
  live yet, because the GeekyKey Service's routes arrive at checkpoint 6.
*/
export function createHttpClient(options: HttpClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);

  async function send(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        credentials: "include",
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }

    if (response.ok || (response.status >= 200 && response.status < 300)) {
      return response;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const parsed = parseErrorBody(body);
    const error = new ApiError(
      response.status,
      parsed.code ?? errorCodeForStatus(response.status),
      parsed.issues,
    );
    if (path !== "/api/v1/me") publishAuthError(error);
    throw error;
  }

  async function sendJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await send(path, init);
    try {
      return (await response.json()) as T;
    } catch {
      throw new NetworkError("The server returned an invalid response");
    }
  }

  /** 204 has no body to parse, so release and logout stop at send(). */
  async function sendNoContent(path: string, init?: RequestInit): Promise<void> {
    await send(path, init);
  }

  function jsonBody(body: unknown, method: "POST" | "PUT"): RequestInit {
    return {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  function postJson(body: unknown): RequestInit {
    return jsonBody(body, "POST");
  }

  /** A UID in the path must already be normalised; the services normalise on input, but not in a URL. */
  const tokenPath = (uid: string) => `/api/v1/tokens/${encodeURIComponent(uid)}`;
  const stationPath = (stationId: string) =>
    `/api/v1/admin/stations/${encodeURIComponent(stationId)}`;

  return {
    me: () => sendJson<unknown>("/api/v1/me").then(parseMeResponse),

    devLogin: async (userId) => {
      await send("/auth/dev-login", postJson({ user_id: userId }));
    },

    logout: () => sendNoContent("/auth/logout", { method: "POST" }),

    // A URL for the browser to visit, not a request, so this one needs no send().
    loginUrl: (returnTo) => `${baseUrl}/auth/login?return_to=${encodeURIComponent(returnTo)}`,

    getToken: (uid) => sendJson<unknown>(tokenPath(uid)).then(parseTokenLookupResponse),

    // 201 when newly claimed, 200 when already yours. The body is the same either way.
    claimToken: (uid) =>
      sendJson<unknown>(`${tokenPath(uid)}/claim`, { method: "POST" }).then(parseClaimResponse),

    releaseToken: async (uid, ownerId) => {
      const query = ownerId === undefined ? "" : `?owner_id=${encodeURIComponent(ownerId)}`;
      await sendNoContent(`${tokenPath(uid)}${query}`, { method: "DELETE" });
    },

    listStations: () => sendJson<unknown>("/api/v1/admin/stations").then(parseListStationsResponse),

    createStation: (input) =>
      sendJson<unknown>("/api/v1/admin/stations", postJson(input)).then(parseCreateStationResponse),

    replaceStationKey: (stationId) =>
      sendJson<unknown>(`${stationPath(stationId)}/key`, { method: "POST" }).then(
        parseReplaceStationKeyResponse,
      ),

    setStationLink: (stationId, input) =>
      sendJson<unknown>(`${stationPath(stationId)}/link`, jsonBody(input, "PUT")).then(
        parseStationResponse,
      ),

    disableStation: (stationId) =>
      sendJson<unknown>(`${stationPath(stationId)}/disable`, { method: "POST" }).then(
        parseStationResponse,
      ),

    enableStation: (stationId) =>
      sendJson<unknown>(`${stationPath(stationId)}/enable`, { method: "POST" }).then(
        parseStationResponse,
      ),
  };
}

const ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "token_taken",
  "token_limit_reached",
  "rate_limited",
  "internal_error",
]);

function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "validation_failed";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "internal_error";
  if (status === 429) return "rate_limited";
  return "internal_error";
}

function parseErrorBody(body: unknown): { code?: ErrorCode; issues: ApiIssue[] } {
  if (!body || typeof body !== "object") return { issues: [] };
  const record = body as Record<string, unknown>;
  const code =
    typeof record.error === "string" && ERROR_CODES.has(record.error as ErrorCode)
      ? (record.error as ErrorCode)
      : undefined;
  const issues = Array.isArray(record.issues)
    ? record.issues.flatMap((issue): ApiIssue[] => {
        if (!issue || typeof issue !== "object") return [];
        const value = issue as Record<string, unknown>;
        if (!Array.isArray(value.path) || typeof value.message !== "string") return [];
        const path = value.path.filter(
          (part): part is string | number => typeof part === "string" || typeof part === "number",
        );
        return [{ path, message: value.message }];
      })
    : [];
  return { code, issues };
}
