import type {
  CreateStationRequest,
  CreateStationResponse,
  EventStationBoardResponse,
  FallbackTapRequest,
  FallbackTapResponse,
  ListStationsResponse,
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

  /** POST /auth/logout */
  logout(): Promise<void>;

  /** Where to send the browser to start the login. GET /auth/login?return_to=... Agreement 0.4
   *  moved that endpoint out of scope for the showcase; POST /auth/firebase (7.2) replaces
   *  it, which is FRO-33. Kept because it is the return-URL rule's only caller today. */
  loginUrl(returnTo: string): string;

  /** GET /api/v1/admin/stations (GeekyKey station registry). */
  listStations(): Promise<ListStationsResponse>;

  /** GET /api/v1/admin/stations (Event Service v0.2 board). Same path, different response. */
  listStationBoard(): Promise<EventStationBoardResponse>;

  /** POST /api/v1/admin/stations. The key in the response is shown once. */
  createStation(input: CreateStationRequest): Promise<CreateStationResponse>;

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
