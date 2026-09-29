import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import type {
  ApiIssue,
  CreateStationResponse,
  ErrorCode,
  FallbackTapResponse,
  ListStationsResponse,
  ListTapsQuery,
  ListTapsResponse,
  PairTokenResponse,
  StatsResponse,
} from "@/api/types";
import { normaliseUid } from "@/lib/format";
import { parseMeResponse } from "@/api/schemas";

export interface HttpClientOptions {
  /** Prefix for every path. Empty in dev: Vite proxies /api and /auth to the backend on :8000. */
  baseUrl?: string;
  /** Maximum time to wait for one HTTP exchange. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/*
  The real client. Same interface and the same thrown errors as the mock, so no
  screen can tell them apart. Which methods the app actually calls through here
  is decided in src/api/create-client.ts, one slice at a time.

  Everything below send() is plumbing: a path, a body, and a cast to the type in
  src/api/types.ts. send() itself is the part that has to be right.
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

  function postJson(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    me: () => sendJson<unknown>("/api/v1/me").then(parseMeResponse),

    devLogin: async (userId) => {
      await send("/auth/dev-login", postJson({ user_id: userId }));
    },

    logout: async () => {
      await send("/auth/logout", { method: "POST" });
    },

    // A URL for the browser to visit, not a request, so this one needs no send().
    loginUrl: (returnTo) => `${baseUrl}/auth/login?return_to=${encodeURIComponent(returnTo)}`,

    pairToken: async (uid) => {
      // The backend normalises the UID, so send whatever the participant typed.
      const response = await send("/api/v1/tokens/pair", postJson({ uid }));
      let body: PairTokenResponse;
      try {
        body = (await response.json()) as PairTokenResponse;
      } catch {
        throw new NetworkError("The server returned an invalid response");
      }
      // 201 is a new pairing, 200 is the idempotent repeat. The pair screen words them differently.
      return { token: body.token, created: response.status === 201 };
    },

    unpairToken: async (uid) => {
      // Normalised here only because this UID goes in the path, where punctuation would have to be escaped.
      await send(`/api/v1/tokens/${encodeURIComponent(normaliseUid(uid))}`, { method: "DELETE" });
    },

    listStations: () => sendJson<ListStationsResponse>("/api/v1/admin/stations"),

    createStation: (input) =>
      sendJson<CreateStationResponse>("/api/v1/admin/stations", postJson(input)),

    listTaps: (query) => sendJson<ListTapsResponse>(`/api/v1/admin/taps${toSearch(query)}`),

    createFallbackTap: (input) =>
      sendJson<FallbackTapResponse>("/api/v1/admin/taps", postJson(input)),

    stats: () => sendJson<StatsResponse>("/api/v1/admin/stats"),

    exportCsv: async () => (await send("/api/v1/admin/export.csv")).blob(),
  };
}

const ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "validation_failed",
  "unauthenticated",
  "missing_station_key",
  "invalid_station_key",
  "forbidden",
  "not_found",
  "uid_already_paired",
  "internal_error",
]);

function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "validation_failed";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "uid_already_paired";
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

/** Only the filters that are set. An absent one must not travel as the string "undefined". */
function toSearch(query: ListTapsQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}
