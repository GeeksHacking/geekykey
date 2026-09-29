import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  createFixtures,
  type MockData,
  type MockStation,
  type MockTap,
  type MockUser,
} from "@/api/mock/fixtures";
import {
  EXPORT_CSV_COLUMNS,
  type AdminTap,
  type ApiIssue,
  type CreateStationRequest,
  type CreateStationResponse,
  type ErrorCode,
  type FallbackTapRequest,
  type FallbackTapResponse,
  type ListStationsResponse,
  type ListTapsQuery,
  type ListTapsResponse,
  type MeResponse,
  type Station,
  type StatsResponse,
  type TapStatus,
  type Token,
} from "@/api/types";
import { MOCK_LATENCY_MS, STATION_ONLINE_WINDOW_MS } from "@/lib/constants";
import { normaliseUid } from "@/lib/format";

/*
  In-memory stand-in for apps/backend. Same interface as the future HTTP client,
  same shapes as API-AGREEMENT.md, same status codes. It also mirrors the two
  backend rules screens need to see in action (cooldown, one-time station key),
  purely so the mock feels like the real thing. The frontend proper never
  computes these.
*/

const UID_PATTERN = /^(?:[0-9A-F]{2}){4,10}$/;
const COOLDOWN_MS = 300_000;
const SESSION_KEY = "gk-mock-session";

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  missing_station_key: 401,
  invalid_station_key: 401,
  forbidden: 403,
  not_found: 404,
  token_taken: 409,
  token_limit_reached: 409,
  uid_already_paired: 409,
  rate_limited: 429,
  invalid_event_service_key: 401,
  event_service_unavailable: 503,
  portal_unavailable: 503,
  internal_error: 500,
};

export type MockFailure = ErrorCode | "network";

export interface MockClientOptions {
  data?: MockData;
  /** [min, max] simulated latency. Use [0, 0] in tests. */
  latencyMs?: readonly [number, number];
  /** Keep online stations alive and append new taps over time. */
  simulate?: boolean;
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
  stop(): void;
}

export type MockApiClient = ApiClient & { mock: MockControls };

export function createMockClient(options: MockClientOptions = {}): MockApiClient {
  const now = options.now ?? (() => Date.now());
  const data = options.data ?? createFixtures(now());
  const latency = options.latencyMs ?? MOCK_LATENCY_MS;
  const storage = options.storage === undefined ? safeSessionStorage() : options.storage;

  let sessionUserId: string | null = storage?.getItem(SESSION_KEY) ?? null;
  let pendingFailure: MockFailure | null = null;
  let nextTapId = data.taps.reduce((max, tap) => Math.max(max, tap.id), 0) + 1;

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

  // Explicit type so TypeScript treats a bare `fail(...)` statement as the end of that path.
  const fail: (code: ErrorCode, issues?: ApiIssue[]) => never = (code, issues) => {
    const error = new ApiError(HTTP_STATUS[code], code, issues);
    publishAuthError(error);
    throw error;
  };

  function currentUser(): MockUser {
    const user = sessionUserId ? data.users.find((u) => u.id === sessionUserId) : undefined;
    return user ?? fail("unauthenticated");
  }

  function currentOrganizer(): MockUser {
    const user = currentUser();
    return user.role === "organizer" ? user : fail("forbidden");
  }

  function setSession(userId: string | null) {
    sessionUserId = userId;
    if (userId) storage?.setItem(SESSION_KEY, userId);
    else storage?.removeItem(SESSION_KEY);
  }

  const activeToken = (uid: string) => data.tokens.find((t) => t.uid === uid && !t.revoked_at);
  const userToken = (userId: string) =>
    data.tokens.find((t) => t.user_id === userId && !t.revoked_at);
  const stationById = (id: string) => data.stations.find((s) => s.id === id);
  const userById = (id: string) => data.users.find((u) => u.id === id);

  /** Backend rule mirrored for realism: a second accepted tap at the same station inside the window is a cooldown. */
  function resolveStatus(userId: string | null, stationId: string, atMs: number): TapStatus {
    if (!userId) return "unknown_token";
    const recent = data.taps.some(
      (t) =>
        t.user_id === userId &&
        t.station_id === stationId &&
        t.status === "accepted" &&
        atMs - new Date(t.received_at).getTime() < COOLDOWN_MS,
    );
    return recent ? "cooldown" : "accepted";
  }

  function appendTap(tap: Omit<MockTap, "id">): MockTap {
    const stored: MockTap = { id: nextTapId++, ...tap };
    data.taps.push(stored);
    return stored;
  }

  function toStation(station: MockStation): Station {
    const seen = station.last_seen_at ? new Date(station.last_seen_at).getTime() : null;
    return {
      id: station.id,
      name: station.name,
      location: station.location,
      points: station.points,
      created_at: station.created_at,
      last_seen_at: station.last_seen_at,
      online: seen !== null && now() - seen < STATION_ONLINE_WINDOW_MS,
    };
  }

  function toAdminTap(tap: MockTap): AdminTap {
    const station = stationById(tap.station_id);
    const user = tap.user_id ? userById(tap.user_id) : undefined;
    return {
      id: tap.id,
      client_tap_id: tap.client_tap_id,
      station: { id: tap.station_id, name: station?.name ?? "Removed station" },
      user: user ? { id: user.id, display_name: user.display_name } : null,
      token_uid: tap.token_uid,
      status: tap.status,
      source: tap.source,
      tapped_at: tap.tapped_at,
      received_at: tap.received_at,
    };
  }

  const client: ApiClient = {
    me: () =>
      call((): MeResponse => {
        const user = currentUser();
        const mine = data.taps.filter((t) => t.user_id === user.id);
        const accepted = mine.filter((t) => t.status === "accepted");
        const stamps = data.stations.map((station) => {
          const first = accepted
            .filter((t) => t.station_id === station.id)
            .sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
          return {
            station_id: station.id,
            name: station.name,
            location: station.location,
            points: station.points,
            earned_at: first?.received_at ?? null,
          };
        });
        const points = accepted.reduce(
          (sum, t) => sum + (stationById(t.station_id)?.points ?? 0),
          0,
        );
        const recent_taps = [...mine]
          .sort((a, b) => b.id - a.id)
          .slice(0, 50)
          .map((t) => ({
            id: t.id,
            station_id: t.station_id,
            station_name: stationById(t.station_id)?.name ?? "Removed station",
            status: t.status,
            source: t.source,
            tapped_at: t.tapped_at,
            received_at: t.received_at,
          }));
        const tokens: Token[] = data.tokens
          .filter((t) => t.user_id === user.id && !t.revoked_at)
          .map((t) => ({ uid: t.uid, paired_at: t.paired_at }));
        return {
          user: { id: user.id, display_name: user.display_name, role: user.role },
          tokens,
          points,
          stamps,
          recent_taps,
        };
      }),

    devLogin: (userId) =>
      call(() => {
        if (!userById(userId)) fail("not_found");
        setSession(userId);
      }),

    logout: () =>
      call(() => {
        setSession(null);
      }),

    loginUrl: (returnTo) => `/auth/login?return_to=${encodeURIComponent(returnTo)}`,

    pairToken: (raw) =>
      call(() => {
        const user = currentUser();
        const uid = normaliseUid(raw);
        if (!UID_PATTERN.test(uid)) {
          fail("validation_failed", [{ path: ["uid"], message: "uid must be 4 to 10 hex bytes" }]);
        }
        const existing = activeToken(uid);
        if (existing) {
          if (existing.user_id !== user.id) fail("uid_already_paired");
          return { token: { uid: existing.uid, paired_at: existing.paired_at }, created: false };
        }
        const token = { uid, user_id: user.id, paired_at: iso(now()), revoked_at: null };
        data.tokens.push(token);
        return { token: { uid: token.uid, paired_at: token.paired_at }, created: true };
      }),

    unpairToken: (raw) =>
      call(() => {
        const user = currentUser();
        const uid = normaliseUid(raw);
        const token = data.tokens.find(
          (t) => t.uid === uid && t.user_id === user.id && !t.revoked_at,
        );
        if (!token) fail("not_found");
        token.revoked_at = iso(now());
      }),

    listStations: () =>
      call((): ListStationsResponse => {
        currentOrganizer();
        return { stations: data.stations.map(toStation) };
      }),

    createStation: (input: CreateStationRequest) =>
      call((): CreateStationResponse => {
        currentOrganizer();
        const issues: ApiIssue[] = [];
        const name = input.name.trim();
        if (name.length < 1 || name.length > 80)
          issues.push({ path: ["name"], message: "name must be 1 to 80 characters" });
        const points = input.points ?? 1;
        if (!Number.isInteger(points) || points < 0)
          issues.push({ path: ["points"], message: "points must be an integer of 0 or more" });
        if (issues.length) fail("validation_failed", issues);
        const station: MockStation = {
          id: crypto.randomUUID(),
          name,
          location: input.location?.trim() || null,
          points,
          created_at: iso(now()),
          last_seen_at: null,
          simulate_online: false,
        };
        data.stations.push(station);
        return { station: toStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    listTaps: (query: ListTapsQuery = {}) =>
      call((): ListTapsResponse => {
        currentOrganizer();
        const limit = Math.min(200, Math.max(1, query.limit ?? 50));
        const matching = data.taps
          .filter((t) => (query.station_id ? t.station_id === query.station_id : true))
          .filter((t) => (query.status ? t.status === query.status : true))
          .filter((t) => (query.before_id !== undefined ? t.id < query.before_id : true))
          .sort((a, b) => b.id - a.id);
        const page = matching.slice(0, limit);
        const last = page[page.length - 1];
        return {
          taps: page.map(toAdminTap),
          next_before_id: last && matching.length > page.length ? last.id : null,
        };
      }),

    createFallbackTap: (input: FallbackTapRequest) =>
      call((): FallbackTapResponse => {
        currentOrganizer();
        if (!stationById(input.station_id)) fail("not_found");
        const at = now();
        let userId: string | null;
        let uid: string | null;
        if ("user_id" in input) {
          if (!userById(input.user_id)) fail("not_found");
          userId = input.user_id;
          // A QR user_id is a valid identity even when the participant has no active NFC token.
          uid = userToken(userId)?.uid ?? null;
        } else {
          uid = normaliseUid(input.uid);
          if (!UID_PATTERN.test(uid)) {
            fail("validation_failed", [{ path: ["uid"], message: "A UID is 4 to 10 hex bytes." }]);
          }
          userId = activeToken(uid)?.user_id ?? null;
        }
        const tap = appendTap({
          station_id: input.station_id,
          client_tap_id: crypto.randomUUID(),
          token_uid: uid,
          user_id: userId,
          source: "qr_fallback",
          status: resolveStatus(userId, input.station_id, at),
          tapped_at: null,
          received_at: iso(at),
        });
        return { result: { id: tap.id, status: tap.status } };
      }),

    stats: () =>
      call((): StatsResponse => {
        currentOrganizer();
        const accepted = data.taps.filter((t) => t.status === "accepted");
        const unique = (taps: MockTap[]) =>
          new Set(taps.map((t) => t.user_id).filter(Boolean)).size;
        return {
          total_taps: data.taps.length,
          accepted_taps: accepted.length,
          unique_participants: unique(accepted),
          stations: data.stations.map((station) => {
            const here = accepted.filter((t) => t.station_id === station.id);
            return {
              station_id: station.id,
              name: station.name,
              accepted_taps: here.length,
              unique_participants: unique(here),
            };
          }),
        };
      }),

    exportCsv: () =>
      call(() => {
        currentOrganizer();
        const rows = [...data.taps]
          .sort((a, b) => a.id - b.id)
          .map((tap) => {
            const user = tap.user_id ? userById(tap.user_id) : undefined;
            return [
              String(tap.id),
              tap.client_tap_id,
              tap.station_id,
              stationById(tap.station_id)?.name ?? "",
              tap.user_id ?? "",
              user?.display_name ?? "",
              tap.token_uid ?? "",
              tap.status,
              tap.source,
              tap.tapped_at ?? "",
              tap.received_at,
            ];
          });
        const lines = [
          EXPORT_CSV_COLUMNS.join(","),
          ...rows.map((row) => row.map(csvCell).join(",")),
        ];
        return new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
      }),
  };

  // Station simulator: keeps online stations fresh and drips in new taps so polling has something to show.
  let timer: ReturnType<typeof setInterval> | null = null;
  if (options.simulate) {
    timer = setInterval(() => {
      const at = now();
      for (const station of data.stations) {
        if (station.simulate_online) station.last_seen_at = iso(at);
      }
      if (Math.random() < 0.65) {
        const online = data.stations.filter((s) => s.simulate_online);
        const participants = data.users.filter((u) => u.role === "participant");
        const station = online[Math.floor(Math.random() * online.length)];
        const participant = participants[Math.floor(Math.random() * participants.length)];
        if (!station || !participant) return;
        const token = participant ? userToken(participant.id) : undefined;
        const unknown = Math.random() < 0.05 || !token;
        const userId = unknown ? null : participant.id;
        const uid = unknown ? "04DEADBEEF2201" : (token?.uid ?? "04DEADBEEF0000");
        appendTap({
          station_id: station.id,
          client_tap_id: `tap-${String(nextTapId + 100_000).padStart(6, "0")}`,
          token_uid: uid,
          user_id: userId,
          source: "nfc",
          status: resolveStatus(userId, station.id, at),
          tapped_at: iso(at - 700),
          received_at: iso(at),
        });
      }
    }, 7_000);
  }

  return {
    ...client,
    mock: {
      failNext: (failure) => {
        pendingFailure = failure;
      },
      setSession,
      data,
      stop: () => {
        if (timer) clearInterval(timer);
        timer = null;
      },
    },
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function randomBase62(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}
