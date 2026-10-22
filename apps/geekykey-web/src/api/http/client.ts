import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  parseClaimResponse,
  parseLoginLinkResponse,
  parseMeResponse,
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
  The real client, copied from apps/event-web so both apps throw the same ApiError
  and NetworkError types and a screen cannot tell them apart. Which methods the app
  actually calls through here is decided in src/api/create-client.ts: the session
  slice is live, and the token methods wait for checkpoint 6.
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

  return {
    me: () => sendJson<unknown>("/api/v1/me").then(parseMeResponse),

    devLogin: async (userId) => {
      await send("/auth/dev-login", postJson({ user_id: userId }));
    },

    // Agreement 7.2. The ID token comes from Firebase's web SDK, and the service sets its
    // own cookie, so there is nothing for the screens to keep.
    firebaseLogin: async (idToken) => {
      await send("/auth/firebase", postJson({ id_token: idToken }));
    },

    logout: () => sendNoContent("/auth/logout", { method: "POST" }),

    getToken: (uid) => sendJson<unknown>(tokenPath(uid)).then(parseTokenLookupResponse),

    // 201 when newly claimed, 200 when already yours. The body is the same either way.
    claimToken: (uid) =>
      sendJson<unknown>(`${tokenPath(uid)}/claim`, { method: "POST" }).then(parseClaimResponse),

    releaseToken: async (uid, ownerId) => {
      const query = ownerId === undefined ? "" : `?owner_id=${encodeURIComponent(ownerId)}`;
      await sendNoContent(`${tokenPath(uid)}${query}`, { method: "DELETE" });
    },

    // Agreement 8.6. The request carries only the event's id, and the answer carries
    // the link. The screens open the url as it is.
    createLoginLink: (eventId) =>
      sendJson<unknown>("/api/v1/login-links", postJson({ event_id: eventId })).then(
        parseLoginLinkResponse,
      ),
  };
}

const ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "validation_failed",
  "unauthenticated",
  "invalid_token",
  "forbidden",
  "not_found",
  "token_taken",
  "token_limit_reached",
  "rate_limited",
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
 * session, and a 503 here would be the claims stand-in, which has nothing to do with a login.
 * The table says so for what a body the client cannot read cannot say. A body it can read
 * wins: it is the service's own answer, and the Worker in front of the screens answers 503
 * service_unavailable under /api and /auth (agreement 2).
 */
const ENDPOINT_CODES: Record<string, Record<number, ErrorCode>> = {
  "/auth/firebase": { 401: "invalid_token", 503: "login_unavailable" },
};

function errorCodeFor(path: string, status: number, fromBody?: ErrorCode): ErrorCode {
  return fromBody ?? ENDPOINT_CODES[path]?.[status] ?? errorCodeForStatus(status);
}

function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "validation_failed";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "internal_error";
  if (status === 429) return "rate_limited";
  // A bare 503 on these endpoints is claims_unavailable: event_service_unavailable only
  // ever answers a station, and the Worker in front of the screens answers
  // service_unavailable with a body the client can read, so neither is the answer here.
  if (status === 503) return "claims_unavailable";
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
