import type { MeResponse, Token, TokenLookup } from "@/api/types";

/*
  The one interface every feature consumes. Two implementations:
  - src/api/mock: in-memory data shaped like the agreement (current phase)
  - src/api/http: fetch against /api/v1 with credentials (checkpoint 6)

  Screens never know which one they are talking to. Every method here is on the
  GeekyKey Service; none of them is the Event Service's, even where the path
  matches.

  Agreement version 0.3 has no station endpoints here: section 10 is empty, because
  each Event Service registers its own stations and the jobs moved to the Event screens
  (agreement 9.7 to 9.9). A GeekyKey admin's one remaining job is releasing someone
  else's token, which is releaseToken with ownerId.
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
}
