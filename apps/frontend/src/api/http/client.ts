import type { ApiClient } from "@/api/client";
import type {
  CreateStationResponse,
  FallbackTapResponse,
  ListStationsResponse,
  ListTapsQuery,
  ListTapsResponse,
  MeResponse,
  PairTokenResponse,
  StatsResponse,
} from "@/api/types";
import { normaliseUid } from "@/lib/format";

export interface HttpClientOptions {
  /** Prefix for every path. Empty in dev: Vite proxies /api and /auth to the backend on :8000. */
  baseUrl?: string;
}

/*
  The real client. Same interface and the same thrown errors as the mock, so no
  screen can tell them apart. Which methods the app actually calls through here
  is decided in src/api/create-client.ts, one slice at a time.

  Everything below send() is plumbing: a path, a body, and a cast to the type in
  src/api/types.ts. send() itself is the part that has to be right.
*/
export function createHttpClient(options: HttpClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "";

  /*
    NOT WRITTEN YET. This is the one piece of real logic in the file, and every
    screen's error handling depends on it, so a frontend owner writes it by hand
    rather than generating it. Whoever takes the first slice takes this.

    It must:

    1. Call fetch on `${baseUrl}${path}` with `credentials: "include"`. Without
       that the session cookie is not sent and every call comes back 401.
    2. Return the Response untouched on any 2xx. Callers decide what to read from
       it, and the 204 replies (logout, unpair) have no body to read at all.
    3. On a non-2xx, read the `{ error, issues? }` body from the agreement and
       throw `new ApiError(response.status, body.error, body.issues)`.
    4. Still throw a sensible ApiError when there is no body, or the body is not
       JSON. A proxy failure or an HTML error page must not turn into a parse
       crash. Fall back to a code picked from the status, and to "internal_error"
       when the status says nothing useful. The 401 case matters most:
       lib/session-provider.tsx reads the code "unauthenticated" as "signed out"
       and treats every other error as a broken app.
    5. Throw `new NetworkError()` when fetch itself rejects. That is what a
       stopped backend looks like from here.

    Import ApiError and NetworkError from "@/api/errors". The assertions in
    src/api/mock/client.test.ts are the behaviour to match, code for code.
  */
  async function send(path: string, init?: RequestInit): Promise<Response> {
    throw new Error(
      `send() in src/api/http/client.ts is not written yet, so ${init?.method ?? "GET"} ` +
        `${baseUrl}${path} cannot run. Write it, or unset VITE_LIVE_API to go back to the mock client.`,
    );
  }

  async function sendJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await send(path, init);
    return (await response.json()) as T;
  }

  function postJson(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    me: () => sendJson<MeResponse>("/api/v1/me"),

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
      const body = (await response.json()) as PairTokenResponse;
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

/** Only the filters that are set. An absent one must not travel as the string "undefined". */
function toSearch(query: ListTapsQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}
