import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  createFixtures,
  SEEDED_PARTICIPANT_ID,
  type MockData,
  type MockToken,
} from "@/api/mock/fixtures";
import { MOCK_LATENCY_MS } from "@/lib/constants";
import { isValidUid, normalizeUid } from "@/lib/token-uid";
import type {
  ApiIssue,
  ErrorCode,
  EventServiceLink,
  LoginLink,
  MeResponse,
  Token,
  TokenLookup,
} from "@/api/types";

const SESSION_KEY = "gk-mock-session";
/** Agreement 8.2: a user holds at most 3 tokens. */
const MAX_TOKENS = 3;
/** Agreement 8.6: the link expires 60 seconds after it is made. */
const LOGIN_LINK_TTL_MS = 60_000;
/**
 * The Event screens' local address, with the one link their mock accepts. The mock
 * has no GeekyKey Service to sign a link, so it stands in for one, the way the Event
 * screens' mock stands in for the service that checks it.
 */
const MOCK_LOGIN_LINK_URL = "http://localhost:5173/#login=mock";

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  // Agreement 0.4 section 7.2, POST /auth/firebase, on both services.
  invalid_token: 401,
  forbidden: 403,
  not_found: 404,
  token_taken: 409,
  token_limit_reached: 409,
  rate_limited: 429,
  internal_error: 500,
  // Every one of 8.2 to 8.5 answers this when the claims stand-in, or the Portal after
  // the switch, cannot say who owns a token within 4 seconds.
  claims_unavailable: 503,
  login_unavailable: 503,
  service_unavailable: 503,
};

export type MockFailure = ErrorCode | "network";

export interface MockClientOptions {
  data?: MockData;
  /** [min, max] simulated latency. Use [0, 0] in tests. */
  latencyMs?: readonly [number, number];
  now?: () => number;
  /** Where the fake session cookie lives. Pass null to keep it in memory only. */
  storage?: Storage | null;
}

export interface MockControls {
  /** Make the next call reject with this error, then behave normally again. */
  failNext(failure: MockFailure): void;
  /** Sign in without going through devLogin. Tests only. */
  setSession(userId: string | null): void;
  readonly data: MockData;
}

export type MockApiClient = ApiClient & { mock: MockControls };

export function createMockClient(options: MockClientOptions = {}): MockApiClient {
  const now = options.now ?? (() => Date.now());
  const data = options.data ?? createFixtures(now());
  const latency = options.latencyMs ?? MOCK_LATENCY_MS;
  const storage = options.storage === undefined ? safeSessionStorage() : options.storage;

  let sessionUserId: string | null = storage?.getItem(SESSION_KEY) ?? null;
  let pendingFailure: MockFailure | null = null;

  const iso = (ms: number) => new Date(ms).toISOString();

  // The live clients skip the auth error for the session's own GET /me, because a 401 there
  // means nobody is signed in. Each call keeps its own flag, so calls that overlap during the
  // simulated latency cannot change each other's.
  async function call<T>(work: () => T, publishAuth = true): Promise<T> {
    const [min, max] = latency;
    const wait = min + Math.random() * Math.max(0, max - min);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      if (pendingFailure) {
        const failure = pendingFailure;
        pendingFailure = null;
        if (failure === "network") throw new NetworkError();
        throw new ApiError(HTTP_STATUS[failure], failure);
      }
      return work();
    } catch (error) {
      if (publishAuth) publishAuthError(error);
      throw error;
    }
  }

  // Explicit type so a bare `fail(...)` statement is the end of that path.
  const fail: (code: ErrorCode, issues?: ApiIssue[]) => never = (code, issues) => {
    throw new ApiError(HTTP_STATUS[code], code, issues);
  };

  function currentUserId(): string {
    return sessionUserId ?? fail("unauthenticated");
  }

  function setSession(userId: string | null) {
    sessionUserId = userId;
    if (userId) storage?.setItem(SESSION_KEY, userId);
    else storage?.removeItem(SESSION_KEY);
  }

  function isAdmin(userId: string | null | undefined): boolean {
    return userId !== null && userId !== undefined && data.admins.includes(userId);
  }

  function tokenByUid(uid: string): MockToken | undefined {
    return data.tokens.find((token) => token.uid === uid);
  }

  /** A token the fixtures do not carry yet. Claiming one adds it; looking one up does not. */
  function emptyToken(uid: string): MockToken {
    return { uid, owner_id: null, claimed_at: null };
  }

  function ownedTokens(userId: string): MockToken[] {
    // Agreement 8.4: the user's tokens, oldest claim first.
    return data.tokens
      .filter((token) => token.owner_id === userId)
      .sort((a, b) => (a.claimed_at ?? "").localeCompare(b.claimed_at ?? ""));
  }

  function toToken(token: MockToken): Token {
    return { uid: token.uid, claimed_at: token.claimed_at };
  }

  function eventLink(id: string): EventServiceLink | undefined {
    const service = data.event_services.find((item) => item.id === id);
    return service ? { id: service.id, name: service.name, url: service.url } : undefined;
  }

  /** Agreement 8.4: the events with a public address, the ones /me offers. */
  function events(): EventServiceLink[] {
    // Only the Event Services still in the settings are worth linking to.
    return data.event_services
      .filter((service) => service.in_settings)
      .flatMap((service) => {
        const link = eventLink(service.id);
        return link ? [link] : [];
      });
  }

  const client: ApiClient = {
    me: () =>
      call((): MeResponse => {
        const userId = currentUserId();
        return {
          user: { id: userId, is_geekykey_admin: isAdmin(userId) },
          tokens: ownedTokens(userId).map(toToken),
          events: events(),
        };
      }, false),

    devLogin: (userId) =>
      call(() => {
        // The GeekyKey Service keeps no users, so it signs in any ID (agreement 7.1).
        if (userId.trim().length < 1) fail("validation_failed");
        setSession(userId.trim());
      }),

    // The mock has no Firebase to ask, so the sign-in picks the seeded participant. The
    // screens read GET /api/v1/me afterwards, as they do live.
    firebaseLogin: () =>
      call(() => {
        setSession(SEEDED_PARTICIPANT_ID);
      }),

    logout: () =>
      call(() => {
        setSession(null);
      }),

    getToken: (uid) =>
      call((): TokenLookup => {
        const userId = currentUserId();
        const normalized = normalizeUid(uid);
        if (!isValidUid(normalized)) fail("validation_failed");
        // A well-formed UID no token carries reads as unclaimed rather than missing:
        // 8.5 lists only unauthenticated, validation_failed and rate_limited, and a
        // UID-shaped string is one the hardware could answer with.
        const token = tokenByUid(normalized) ?? emptyToken(normalized);

        const owner: TokenLookup["owner"] =
          token.owner_id === null ? "nobody" : token.owner_id === userId ? "you" : "someone_else";
        return {
          uid: token.uid,
          owner,
          claimed_at: owner === "you" ? token.claimed_at : null,
          // Only a GeekyKey admin learns whose token it is (agreement 8.5).
          owner_id: owner === "someone_else" && isAdmin(userId) ? token.owner_id : null,
        };
      }),

    claimToken: (uid) =>
      call((): Token => {
        const userId = currentUserId();
        const normalized = normalizeUid(uid);
        if (!isValidUid(normalized)) fail("validation_failed");
        // A well-formed UID no token carries is claimable, as on the lookup. 8.2
        // lists no not_found either.
        const token = tokenByUid(normalized) ?? emptyToken(normalized);
        if (!data.tokens.includes(token)) data.tokens.push(token);

        // Already yours: 200, idempotent, and the 3-token limit does not apply.
        if (token.owner_id === userId) return toToken(token);
        // The limit before the owner (agreement 8.2), so a user at 3 learns that
        // even when the token is someone else's.
        if (ownedTokens(userId).length >= MAX_TOKENS) fail("token_limit_reached");
        if (token.owner_id !== null) fail("token_taken");

        token.owner_id = userId;
        token.claimed_at = iso(now());
        return toToken(token);
      }),

    releaseToken: (uid, ownerId) =>
      call(() => {
        const userId = currentUserId();
        const normalized = normalizeUid(uid);
        if (!isValidUid(normalized)) fail("validation_failed");
        const token = tokenByUid(normalized);
        if (!token) fail("not_found");

        if (ownerId !== undefined) {
          // Agreement 8.3: only a GeekyKey admin may pass owner_id.
          if (!isAdmin(userId)) fail("forbidden");
          // The owner the lookup showed, so a late click cannot release a newer claim.
          if (token.owner_id !== ownerId) fail("not_found");
        } else if (token.owner_id !== userId) {
          fail("not_found");
        }

        token.owner_id = null;
        token.claimed_at = null;
      }),

    // Agreement 8.6: a link to one event's screens, for the session's own user. The
    // event has to be one /me offers, or the service answers not_found.
    createLoginLink: (eventId) =>
      call((): LoginLink => {
        currentUserId();
        // The service reads the body before it looks the event up, so an empty id is
        // refused as a bad request rather than as an event that is not there.
        if (eventId.length < 1) fail("validation_failed");
        if (!events().some((event) => event.id === eventId)) fail("not_found");
        return {
          url: MOCK_LOGIN_LINK_URL,
          expires_at: iso(now() + LOGIN_LINK_TTL_MS),
        };
      }),
  };

  return {
    ...client,
    mock: {
      failNext: (failure) => {
        pendingFailure = failure;
      },
      setSession,
      data,
    },
  };
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
