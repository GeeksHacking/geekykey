import type {
  CreateStationRequest,
  StationKeyResponse,
  StationResponse,
  EventStationBoardResponse,
  FallbackTapRequest,
  FallbackTapResponse,
  ListTapsQuery,
  ListTapsResponse,
  MeResponse,
  SetStationPassportRequest,
  SetStationPassportResponse,
  StatsResponse,
} from "@/api/types";

/*
  The one interface every feature consumes. Two implementations:
  - src/api/mock: in-memory data shaped like the agreement (current phase)
  - src/api/http: fetch against /api/v1 with credentials (integration phase)
  Screens never know which one they are talking to.
*/
export interface ApiClient {
  /** GET /api/v1/me. Rejects with `unauthenticated` when there is no session. */
  me(): Promise<MeResponse>;

  /** POST /auth/dev-login. Local development only. */
  devLogin(userId: string): Promise<void>;

  /**
   * POST /auth/firebase (agreement 7.2). Signs in with the ID token Firebase's web SDK
   * gave the screens. The service checks it and sets its own cookie, and the screens read
   * GET /api/v1/me as usual afterwards.
   */
  firebaseLogin(idToken: string): Promise<void>;

  /** POST /auth/logout */
  logout(): Promise<void>;

  /**
   * GET /api/v1/admin/stations, the Event Service's own registered stations, enabled or
   * disabled (agreement 9.2). Version 0.3 removed the old station registry that sat
   * behind the GeekyKey Service, so there is no second stations call.
   */
  listStationBoard(): Promise<EventStationBoardResponse>;

  /** POST /api/v1/admin/stations (agreement 9.7). The key in the response is shown once. */
  createStation(input: CreateStationRequest): Promise<StationKeyResponse>;

  /**
   * POST /api/v1/admin/stations/{id}/key (agreement 9.8). Replaces the key, keeping the
   * station's ID, its passport settings and its stamps. No request body, and the same answer
   * as a create, with the new key shown once.
   */
  replaceStationKey(stationId: string): Promise<StationKeyResponse>;

  /** POST /api/v1/admin/stations/{id}/disable (agreement 9.9). Sets `disabled_at`. */
  disableStation(stationId: string): Promise<StationResponse>;

  /** POST /api/v1/admin/stations/{id}/enable (agreement 9.9). Clears `disabled_at`. */
  enableStation(stationId: string): Promise<StationResponse>;

  /**
   * PUT /api/v1/admin/stations/{id}/passport. Adds the station to the passport or changes
   * its settings. Agreement 9.1.
   */
  setStationPassport(
    stationId: string,
    input: SetStationPassportRequest,
  ): Promise<SetStationPassportResponse>;

  /** GET /api/v1/admin/taps */
  listTaps(query?: ListTapsQuery): Promise<ListTapsResponse>;

  /** POST /api/v1/admin/taps */
  createFallbackTap(input: FallbackTapRequest): Promise<FallbackTapResponse>;

  /** GET /api/v1/admin/stats */
  stats(): Promise<StatsResponse>;

  /** GET /api/v1/admin/export.csv as a file the browser can save. */
  exportCsv(): Promise<Blob>;
}
