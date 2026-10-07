import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  createFixtures,
  type MockData,
  type MockStation,
  type MockToken,
} from "@/api/mock/fixtures";
import type {
  ApiIssue,
  CreateStationRequest,
  CreateStationResponse,
  ErrorCode,
  EventServiceLink,
  ListStationsResponse,
  MeResponse,
  ReplaceStationKeyResponse,
  SetStationLinkRequest,
  Station,
  Token,
  TokenLookup,
} from "@/api/types";

const SESSION_KEY = "gk-mock-session";
const STATION_ONLINE_WINDOW_MS = 120_000;
/** Agreement 8.2: a user holds at most 3 tokens. */
const MAX_TOKENS = 3;

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  token_taken: 409,
  token_limit_reached: 409,
  rate_limited: 429,
  internal_error: 500,
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

/**
 * Agreement "Token UID": normalise by stripping anything that is not a hex digit
 * and upper-casing, so `04:a1:b2:c3:d4:e5:f6` and `04A1B2C3D4E5F6` are one token.
 * After normalisation a UID is 4 to 10 bytes, that is 8 to 20 hex characters.
 */
export function normalizeUid(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/**
 * A UID is 4 to 10 bytes, "that is 8 to 20 hex characters" (agreement "Token UID").
 * The count must also be even: a chip's UID is whole bytes, so an odd number of hex
 * characters is not a UID any token carries.
 */
function isValidNormalizedUid(uid: string): boolean {
  return uid.length >= 8 && uid.length <= 20 && uid.length % 2 === 0;
}

export function createMockClient(options: MockClientOptions = {}): MockApiClient {
  const now = options.now ?? (() => Date.now());
  const data = options.data ?? createFixtures(now());
  const latency = options.latencyMs ?? [180, 520];
  const storage = options.storage === undefined ? safeSessionStorage() : options.storage;

  let sessionUserId: string | null = storage?.getItem(SESSION_KEY) ?? null;
  let pendingFailure: MockFailure | null = null;

  const iso = (ms: number) => new Date(ms).toISOString();

  async function call<T>(work: () => T): Promise<T> {
    const [min, max] = latency;
    const wait = min + Math.random() * Math.max(0, max - min);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (pendingFailure) {
      const failure = pendingFailure;
      pendingFailure = null;
      if (failure === "network") throw new NetworkError();
      const error = new ApiError(HTTP_STATUS[failure], failure);
      publishAuthError(error);
      throw error;
    }
    return work();
  }

  // Explicit type so a bare `fail(...)` statement is the end of that path.
  const fail: (code: ErrorCode, issues?: ApiIssue[]) => never = (code, issues) => {
    const error = new ApiError(HTTP_STATUS[code], code, issues);
    publishAuthError(error);
    throw error;
  };

  function currentUserId(): string {
    return sessionUserId ?? fail("unauthenticated");
  }

  /** Section 10: the admin list gates every station endpoint. Anyone else gets forbidden. */
  function currentAdminId(): string {
    const userId = currentUserId();
    if (!data.admins.includes(userId)) fail("forbidden");
    return userId;
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

  function requireStation(stationId: string): MockStation {
    const station = data.stations.find((item) => item.id === stationId);
    if (!station) fail("not_found");
    return station;
  }

  function toStation(station: MockStation): Station {
    const seen = station.last_seen_at ? new Date(station.last_seen_at).getTime() : null;
    const service = station.link
      ? data.event_services.find((item) => item.id === station.link?.event_service_id)
      : undefined;
    return {
      id: station.id,
      label: station.label,
      created_at: station.created_at,
      link: station.link
        ? {
            event_service_id: station.link.event_service_id,
            // Null once that Event Service leaves the settings (agreement 10).
            event_service_name: service?.in_settings ? service.name : null,
            linked_at: station.link.linked_at,
          }
        : null,
      disabled_at: station.disabled_at,
      last_seen_at: station.last_seen_at,
      online: seen !== null && now() - seen < STATION_ONLINE_WINDOW_MS,
      firmware_version: station.firmware_version,
      buffered_taps: station.buffered_taps,
      reader_ok: station.reader_ok,
    };
  }

  const client: ApiClient = {
    me: () =>
      call((): MeResponse => {
        const userId = currentUserId();
        return {
          user: { id: userId, is_geekykey_admin: isAdmin(userId) },
          tokens: ownedTokens(userId).map(toToken),
          // Only the Event Services still in the settings are worth linking to.
          events: data.event_services
            .filter((service) => service.in_settings)
            .flatMap((service) => {
              const link = eventLink(service.id);
              return link ? [link] : [];
            }),
        };
      }),

    devLogin: (userId) =>
      call(() => {
        // The GeekyKey Service keeps no users, so it signs in any ID (agreement 7.1).
        if (userId.trim().length < 1) fail("validation_failed");
        setSession(userId.trim());
      }),

    logout: () =>
      call(() => {
        setSession(null);
      }),

    loginUrl: (returnTo) => `/auth/login?return_to=${encodeURIComponent(returnTo)}`,

    getToken: (uid) =>
      call((): TokenLookup => {
        const userId = currentUserId();
        const normalized = normalizeUid(uid);
        if (!isValidNormalizedUid(normalized)) fail("validation_failed");
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
        if (!isValidNormalizedUid(normalized)) fail("validation_failed");
        // A well-formed UID no token carries is claimable, as on the lookup. 8.2
        // lists no not_found either.
        const token = tokenByUid(normalized) ?? emptyToken(normalized);
        if (!data.tokens.includes(token)) data.tokens.push(token);

        // Already yours: 200, idempotent, and the 3-token limit does not apply.
        if (token.owner_id === userId) return toToken(token);
        if (token.owner_id !== null) fail("token_taken");
        if (ownedTokens(userId).length >= MAX_TOKENS) fail("token_limit_reached");

        token.owner_id = userId;
        token.claimed_at = iso(now());
        return toToken(token);
      }),

    releaseToken: (uid, ownerId) =>
      call(() => {
        const userId = currentUserId();
        const normalized = normalizeUid(uid);
        if (!isValidNormalizedUid(normalized)) fail("validation_failed");
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

    listStations: () =>
      call((): ListStationsResponse => {
        currentAdminId();
        return {
          stations: data.stations.map(toStation),
          event_services: data.event_services
            .filter((service) => service.in_settings)
            .map((service) => ({ id: service.id, name: service.name })),
        };
      }),

    createStation: (input: CreateStationRequest) =>
      call((): CreateStationResponse => {
        currentAdminId();
        const label = input.label.trim();
        if (label.length < 1 || label.length > 80) {
          fail("validation_failed", [
            { path: ["label"], message: "label must be 1 to 80 characters" },
          ]);
        }
        const station: MockStation = {
          id: crypto.randomUUID(),
          label,
          created_at: iso(now()),
          // A new station has no link (agreement 10.2).
          link: null,
          disabled_at: null,
          last_seen_at: null,
          firmware_version: null,
          buffered_taps: null,
          reader_ok: null,
        };
        data.stations.push(station);
        return { station: toStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    replaceStationKey: (stationId) =>
      call((): ReplaceStationKeyResponse => {
        currentAdminId();
        // Replaces the key, keeping the ID and the link (agreement 10.3).
        const station = requireStation(stationId);
        return { station: toStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    setStationLink: (stationId, input: SetStationLinkRequest) =>
      call((): Station => {
        currentAdminId();
        const station = requireStation(stationId);
        if (input.event_service_id === null) {
          station.link = null;
          return toStation(station);
        }
        const service = data.event_services.find((item) => item.id === input.event_service_id);
        if (!service?.in_settings) {
          fail("validation_failed", [
            { path: ["event_service_id"], message: "That event service is not available" },
          ]);
        }
        // Linking or moving sets linked_at to now (agreement 10.4). Linking it again to
        // the service it already feeds changes nothing, so its saved taps still count.
        if (station.link?.event_service_id !== service.id) {
          station.link = { event_service_id: service.id, linked_at: iso(now()) };
        }
        return toStation(station);
      }),

    disableStation: (stationId) =>
      call((): Station => {
        currentAdminId();
        const station = requireStation(stationId);
        // Doing it twice changes nothing (agreement 10.5).
        station.disabled_at ??= iso(now());
        return toStation(station);
      }),

    enableStation: (stationId) =>
      call((): Station => {
        currentAdminId();
        const station = requireStation(stationId);
        station.disabled_at = null;
        return toStation(station);
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

function randomBase62(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
