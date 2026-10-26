import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import type { ApiIssue, ErrorCode, ListTapsQuery } from "@/api/types";
import {
  parseEventStationBoardResponse,
  parseFallbackTapResponse,
  parseListTapsResponse,
  parseMeResponse,
  parseSetDisplayNameResponse,
  parseSetStationPassportResponse,
  parseStationKeyResponse,
  parseStationResponse,
  parseStatsResponse,
} from "@/api/schemas";

export interface HttpClientOptions {
  /** Prefix for every path. Empty in dev: Vite proxies /api and /auth to the Event Service on :8001. */
  baseUrl?: string;
  /** Maximum time to wait for one HTTP exchange. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/*
  The real client. Same interface and the same thrown errors as the mock, so no
  screen can tell them apart. Which methods the app actually calls through here
  is decided in src/api/create-client.ts, one slice at a time.

  Everything below send() is plumbing: a path, a body, and the schema in
  src/api/schemas.ts that checks the answer. send() itself is the part that has to be right.
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
      errorCodeFor(path, response.status, parsed.code),
      parsed.issues,
    );
    // The session query answers /me's own 401 itself. The name's PATCH to the same path is
    // not that read, so it publishes like any other request.
    const readingSession = path === "/api/v1/me" && (init?.method ?? "GET") === "GET";
    if (!readingSession) publishAuthError(error);
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

  function jsonBody(body: unknown, method: "POST" | "PUT" | "PATCH"): RequestInit {
    return {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  function postJson(body: unknown): RequestInit {
    return jsonBody(body, "POST");
  }

  return {
    me: () => sendJson<unknown>("/api/v1/me").then(parseMeResponse),

    // Agreement 8.7. The answer replaces the user in the ["me"] cache, so it is checked
    // like /me's.
    setDisplayName: (input) =>
      sendJson<unknown>("/api/v1/me", jsonBody(input, "PATCH")).then(parseSetDisplayNameResponse),

    devLogin: async (userId) => {
      await send("/auth/dev-login", postJson({ user_id: userId }));
    },

    // Agreement 7.2. The ID token comes from Firebase's web SDK, and the service sets its
    // own cookie, so there is nothing for the screens to keep.
    firebaseLogin: async (idToken) => {
      await send("/auth/firebase", postJson({ id_token: idToken }));
    },

    // Agreement 7.4. The link comes from the address the GeekyKey screens opened, and the
    // service sets its own cookie, as for 7.2.
    loginLink: async (link) => {
      await send("/auth/login-link", postJson({ login_link: link }));
    },

    logout: async () => {
      await send("/auth/logout", { method: "POST" });
    },

    // Agreement 9.2. The Event Service answers with its own registered stations, so
    // this is the only call to this path that reads.
    listStationBoard: () =>
      sendJson<unknown>("/api/v1/admin/stations").then(parseEventStationBoardResponse),

    // Agreement 9.7. The response is the one place the key is ever sent.
    createStation: (input) =>
      sendJson<unknown>("/api/v1/admin/stations", postJson(input)).then(parseStationKeyResponse),

    // 9.8 sends no body, so this is the shape logout already uses rather than jsonBody.
    replaceStationKey: (stationId) =>
      sendJson<unknown>(`/api/v1/admin/stations/${encodeURIComponent(stationId)}/key`, {
        method: "POST",
      }).then(parseStationKeyResponse),

    // 9.9 is the same bodyless shape, answered with the station alone instead of a key.
    disableStation: (stationId) =>
      sendJson<unknown>(`/api/v1/admin/stations/${encodeURIComponent(stationId)}/disable`, {
        method: "POST",
      }).then(parseStationResponse),

    enableStation: (stationId) =>
      sendJson<unknown>(`/api/v1/admin/stations/${encodeURIComponent(stationId)}/enable`, {
        method: "POST",
      }).then(parseStationResponse),

    setStationPassport: (stationId, input) =>
      sendJson<unknown>(
        `/api/v1/admin/stations/${encodeURIComponent(stationId)}/passport`,
        jsonBody(input, "PUT"),
      ).then(parseSetStationPassportResponse),

    listTaps: (query) =>
      sendJson<unknown>(`/api/v1/admin/taps${toSearch(query)}`).then(parseListTapsResponse),

    createFallbackTap: (input) =>
      sendJson<unknown>("/api/v1/admin/taps", postJson(input)).then(parseFallbackTapResponse),

    stats: () => sendJson<unknown>("/api/v1/admin/stats").then(parseStatsResponse),

    exportCsv: async () => (await send("/api/v1/admin/export.csv")).blob(),
  };
}

const ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "validation_failed",
  "unauthenticated",
  "invalid_token",
  "invalid_login_link",
  "missing_station_key",
  "invalid_station_key",
  "forbidden",
  "not_found",
  "rate_limited",
  "invalid_event_service_key",
  "event_service_unavailable",
  "claims_unavailable",
  "login_unavailable",
  "service_unavailable",
  "internal_error",
]);

/**
 * The codes an endpoint's status means, where the status alone would say the wrong thing.
 *
 * Agreement 7.2's login answers 401 invalid_token and 503 login_unavailable, and neither is
 * the code the status gives everywhere else: a 401 is unauthenticated, which reads as a lost
 * session, and a 503 is a service that did not answer. The table says so for what a body the
 * client cannot read cannot say. Agreement 7.4's login link answers 401 invalid_login_link
 * for the same reason: a link that fails leaves the session as it was. A body it can read
 * wins: it is the service's own answer, and the Worker in front of the screens answers 503 service_unavailable under /api and
 * /auth (agreement 2).
 */
const ENDPOINT_CODES: Record<string, Record<number, ErrorCode>> = {
  "/auth/firebase": { 401: "invalid_token", 503: "login_unavailable" },
  "/auth/login-link": { 401: "invalid_login_link" },
};

function errorCodeFor(path: string, status: number, fromBody?: ErrorCode): ErrorCode {
  return fromBody ?? ENDPOINT_CODES[path]?.[status] ?? errorCodeForStatus(status);
}

function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "validation_failed";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 503) return "event_service_unavailable";
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
