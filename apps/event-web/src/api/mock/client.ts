import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  createFixtures,
  SEEDED_PARTICIPANT_ID,
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
  type StationKeyResponse,
  type ErrorCode,
  type EventStationBoardResponse,
  type EventStationBoardStation,
  type FallbackTapRequest,
  type FallbackTapResponse,
  type FallbackTapStatus,
  type ListTapsQuery,
  type ListTapsResponse,
  type MeResponse,
  type SetStationPassportResponse,
  type StationResponse,
  type StatsResponse,
  type TapStatus,
} from "@/api/types";
import { MOCK_LATENCY_MS, STATION_ONLINE_WINDOW_MS } from "@/lib/constants";

/*
  In-memory stand-in for apps/event-service. Same interface as the future HTTP
  client, same shapes as API-AGREEMENT.md, same status codes. It also mirrors
  the two backend rules screens need to see in action (cooldown, one-time
  station key), purely so the mock feels like the real thing. The frontend
  proper never computes these.
*/

const COOLDOWN_MS = 300_000;
const SESSION_KEY = "gk-mock-session";

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  // Agreement 0.4 section 7.2, POST /auth/firebase, on both services.
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

  const stationById = (id: string) => data.stations.find((s) => s.id === id);
  const userById = (id: string) => data.users.find((u) => u.id === id);

  /** Event rule mirrored for realism: stations without passport settings return no_game; repeated recent taps are cooldowns. */
  function resolveStatus(userId: string, stationId: string, atMs: number): TapStatus {
    const station = stationById(stationId);
    if (!station?.passport) return "no_game";
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

  /**
   * Agreement 9.2. Every field comes from the Event Service's own station row, since
   * version 0.3 removed the status call this board used to sit behind. `online` is
   * recomputed on each read so a poll reflects the wall clock, and a station that has
   * never handed off reads as offline.
   */
  function toStationBoardStation(station: MockStation): EventStationBoardStation {
    const lastTap = data.taps
      .filter((tap) => tap.station_id === station.id && tap.source === "nfc")
      .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
    const seen = station.last_seen_at ? new Date(station.last_seen_at).getTime() : null;
    return {
      id: station.id,
      label: station.label,
      created_at: station.created_at,
      disabled_at: station.disabled_at,
      passport: station.passport,
      last_seen_at: station.last_seen_at,
      online: seen !== null && now() - seen < STATION_ONLINE_WINDOW_MS,
      firmware_version: station.firmware_version,
      buffered_taps: station.buffered_taps,
      reader_ok: station.reader_ok,
      last_tap_at: lastTap?.received_at ?? null,
    };
  }

  function toAdminTap(tap: MockTap): AdminTap {
    const station = stationById(tap.station_id);
    const user = tap.user_id ? userById(tap.user_id) : undefined;
    return {
      id: tap.id,
      client_tap_id: tap.client_tap_id,
      station: { id: tap.station_id, name: station?.passport?.name ?? null },
      user: { id: tap.user_id, display_name: user?.display_name ?? null },
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
        // Only stations with passport settings are slots, oldest settings first (agreement 8.1).
        const stamps = data.stations
          .flatMap((station) => (station.passport ? [{ id: station.id, ...station.passport }] : []))
          .sort((a, b) => a.added_at.localeCompare(b.added_at))
          .map((passport) => {
            const first = accepted
              .filter((t) => t.station_id === passport.id)
              .sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
            return {
              station_id: passport.id,
              name: passport.name,
              location: passport.location,
              points: passport.points,
              earned_at: first?.received_at ?? null,
            };
          });
        const points = accepted.reduce(
          (sum, t) => sum + (stationById(t.station_id)?.passport?.points ?? 0),
          0,
        );
        const recent_taps = [...mine]
          .sort((a, b) => b.id - a.id)
          .slice(0, 50)
          .map((t) => ({
            id: t.id,
            station_id: t.station_id,
            station_name: stationById(t.station_id)?.passport?.name ?? null,
            status: t.status,
            source: t.source,
            tapped_at: t.tapped_at,
            received_at: t.received_at,
          }));
        return {
          user: { id: user.id, display_name: user.display_name, role: user.role },
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

    loginUrl: (returnTo) => `/auth/login?return_to=${encodeURIComponent(returnTo)}`,

    listStationBoard: () =>
      call((): EventStationBoardResponse => {
        currentOrganizer();
        return { stations: data.stations.map(toStationBoardStation) };
      }),

    // Agreement 9.7. The label is the device's name and the only field, so a new
    // station has no passport settings yet and reads as "Not in the passport".
    createStation: (input: CreateStationRequest) =>
      call((): StationKeyResponse => {
        currentOrganizer();
        const issues: ApiIssue[] = [];
        const label = input.label.trim();
        if (label.length < 1 || label.length > 80)
          issues.push({ path: ["label"], message: "label must be 1 to 80 characters" });
        if (issues.length) fail("validation_failed", issues);
        const station: MockStation = {
          id: crypto.randomUUID(),
          label,
          created_at: iso(now()),
          disabled_at: null,
          passport: null,
          last_seen_at: null,
          simulate_online: false,
          firmware_version: null,
          buffered_taps: 0,
          reader_ok: null,
        };
        data.stations.push(station);
        return { station: toStationBoardStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    replaceStationKey: (stationId) =>
      call((): StationKeyResponse => {
        currentOrganizer();
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");

        // 9.8 replaces the key and nothing else, so this deliberately does not touch the
        // station: its id, its passport settings and their added_at, its disabled_at and its
        // last tap all stay as they are. Replacing a disabled station's key is therefore
        // defined, and does not enable it, which the spec's disable-then-replace path needs.
        return { station: toStationBoardStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    // Agreement 9.9. Disabling sets disabled_at and touches nothing else: the station keeps
    // its taps, and by 9.2 its stamp slot and stamps; enabling clears disabled_at so the
    // saved taps count once they arrive. Doing either twice changes nothing, so a
    // re-disable keeps the original disabled_at. The key getting 401 within a minute is
    // the GeekyKey Service's copy refreshing, which no client here sees or computes.
    disableStation: (stationId) =>
      call((): StationResponse => {
        currentOrganizer();
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");
        // The "twice changes nothing" half of 9.9: a re-disable keeps the original
        // disabled_at rather than moving it.
        if (station.disabled_at === null) station.disabled_at = iso(now());
        return { station: toStationBoardStation(station) };
      }),

    enableStation: (stationId) =>
      call((): StationResponse => {
        currentOrganizer();
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");
        station.disabled_at = null;
        return { station: toStationBoardStation(station) };
      }),

    setStationPassport: (stationId, input) =>
      call((): SetStationPassportResponse => {
        currentOrganizer();
        const station = data.stations.find((s) => s.id === stationId);
        if (!station) throw new ApiError(404, "not_found");

        const issues: ApiIssue[] = [];
        const name = input.name.trim();
        if (name.length < 1 || name.length > 80) {
          issues.push({ path: ["name"], message: "name must be 1 to 80 characters" });
        }
        const points = input.points ?? 1;
        if (!Number.isInteger(points) || points < 0) {
          issues.push({ path: ["points"], message: "points must be an integer of 0 or more" });
        }
        const location = input.location?.trim();
        if (location !== undefined && location.length > 80) {
          issues.push({ path: ["location"], message: "location must be 80 characters or fewer" });
        }
        if (issues.length) fail("validation_failed", issues);

        // added_at decides the passport's slot order (agreement 8.1), so changing settings
        // must keep the original one or the station would move. The service answers 201 when
        // it adds and 200 when it changes; the body is the same either way.
        const addedAt = station.passport === null ? iso(now()) : station.passport.added_at;
        station.passport = {
          name,
          location: location || null,
          points,
          added_at: addedAt,
        };
        return { passport: { station_id: station.id, ...station.passport } };
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
        const station = stationById(input.station_id);
        if (!station?.passport) fail("not_found");
        const at = now();
        const userId = input.user_id.trim();
        if (!userId) {
          fail("validation_failed", [
            { path: ["user_id"], message: "Enter the participant's user ID." },
          ]);
        }
        // A user ID is valid even when the participant has never logged in.
        const status = resolveStatus(userId, input.station_id, at);
        if (status === "no_game") fail("not_found");
        const tap = appendTap({
          station_id: input.station_id,
          client_tap_id: crypto.randomUUID(),
          user_id: userId,
          source: "qr_fallback",
          status,
          tapped_at: null,
          received_at: iso(at),
        });
        const resultStatus: FallbackTapStatus = status === "cooldown" ? "cooldown" : "accepted";
        return { result: { id: tap.id, status: resultStatus } };
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
              name: station.passport?.name ?? station.label,
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
              stationById(tap.station_id)?.passport?.name ?? "",
              tap.user_id,
              user?.display_name ?? "",
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
        appendTap({
          station_id: station.id,
          client_tap_id: `tap-${String(nextTapId + 100_000).padStart(6, "0")}`,
          user_id: participant.id,
          source: "nfc",
          status: resolveStatus(participant.id, station.id, at),
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
