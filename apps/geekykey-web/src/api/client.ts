import type {
  CreateStationRequest,
  CreateStationResponse,
  ListStationsResponse,
  MeResponse,
  ReplaceStationKeyResponse,
  SetStationLinkRequest,
  Station,
  Token,
  TokenLookup,
} from "@/api/types";

/*
  The one interface every feature consumes. Two implementations:
  - src/api/mock: in-memory data shaped like the agreement (current phase)
  - src/api/http: fetch against /api/v1 with credentials (checkpoint 6)

  Screens never know which one they are talking to. Every method here is on the
  GeekyKey Service; none of them is the Event Service's, even where the path
  matches.
*/
export interface ApiClient {
  /** GET /api/v1/me. Rejects with `unauthenticated` when there is no session. */
  me(): Promise<MeResponse>;

  /** POST /auth/dev-login. Local development only. */
  devLogin(userId: string): Promise<void>;

  /** POST /auth/logout */
  logout(): Promise<void>;

  /** Where to send the browser to start the portal login. GET /auth/login?return_to=... */
  loginUrl(returnTo: string): string;

  /** GET /api/v1/tokens/{uid}. Agreement 8.5. */
  getToken(uid: string): Promise<TokenLookup>;

  /**
   * POST /api/v1/tokens/{uid}/claim. Agreement 8.2. Resolves for both 201
   * (newly claimed) and 200 (already yours), so callers cannot tell the two apart.
   */
  claimToken(uid: string): Promise<Token>;

  /**
   * DELETE /api/v1/tokens/{uid}. Agreement 8.3. An owner releases their own token;
   * a GeekyKey admin releases someone else's by passing the `owner_id` the lookup
   * showed.
   */
  releaseToken(uid: string, ownerId?: string): Promise<void>;

  /** GET /api/v1/admin/stations. Agreement 10.1. Poll every 10 to 15 seconds. */
  listStations(): Promise<ListStationsResponse>;

  /** POST /api/v1/admin/stations. Agreement 10.2. The key is shown once. */
  createStation(input: CreateStationRequest): Promise<CreateStationResponse>;

  /** POST /api/v1/admin/stations/{id}/key. Agreement 10.3. The new key is shown once. */
  replaceStationKey(stationId: string): Promise<ReplaceStationKeyResponse>;

  /** PUT /api/v1/admin/stations/{id}/link. Agreement 10.4. A null id unlinks. */
  setStationLink(stationId: string, input: SetStationLinkRequest): Promise<Station>;

  /** POST /api/v1/admin/stations/{id}/disable. Agreement 10.5. */
  disableStation(stationId: string): Promise<Station>;

  /** POST /api/v1/admin/stations/{id}/enable. Agreement 10.5. */
  enableStation(stationId: string): Promise<Station>;
}
