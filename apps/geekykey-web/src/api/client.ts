import type {
  LoginLink,
  Meeting,
  MeResponse,
  Token,
  TokenKind,
  TokenKindsLoaded,
  TokenKindTotal,
  TokenLookup,
} from "@/api/types";

/*
  The one interface every feature consumes. Two implementations:
  - src/api/mock: in-memory data shaped like the agreement, for tests and `pnpm dev`
  - src/api/http: fetch against /api/v1 with credentials

  Screens never know which one they are talking to. Every method here is on the
  GeekyKey Service; none of them is the Event Service's, even where the path
  matches.

  Agreement version 0.3 has no station endpoints here: section 10 is empty, because
  each Event Service registers its own stations and the jobs moved to the Event screens
  (agreement 9.7 to 9.9). A GeekyKey admin releases someone else's token, which is
  releaseToken with ownerId, and loads token kinds (BAC-139).
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

  /**
   * POST /api/v1/login-links. Agreement 8.6. A link to one event's screens for the
   * current user, which works once and expires 60 seconds after it is made. The
   * event buttons on My tokens and the token page open the url it answers and
   * keep nothing.
   *
   * `uid` is the token page's token, in any separator style. With it, the service
   * carries that token's kind in the link (11.9) while the user owns it. My tokens
   * sends none, because it shows several tokens and no single one made the link.
   */
  createLoginLink(eventId: string, uid?: string): Promise<LoginLink>;

  /**
   * POST /api/v1/tokens/{uid}/meet. Agreement 8.8. The current user tapped someone
   * else's token, one half of a connection (CONTEXT.md's "Half"). The token page calls
   * it by itself, once, when its lookup (8.5) answers `someone_else`, and never for a
   * GeekyKey admin, who may be holding a lost token.
   *
   * The answer is one item for each Event Service that takes meetings, in /me's order,
   * and empty when none does (11.10). Tapping the token again sends the half again,
   * which does no harm, so a failure needs no retry of its own.
   */
  meetToken(uid: string): Promise<Meeting[]>;

  /**
   * GET /api/v1/admin/token-kinds, GeekyKey admins and organizers (BAC-139). How many
   * tokens each kind has on the list, by kind in order.
   */
  getTokenKinds(): Promise<TokenKindTotal[]>;

  /**
   * POST /api/v1/admin/token-kinds, GeekyKey admins only (BAC-139). Puts up to 500 tokens
   * on the list. A token not named keeps its kind, and nothing is ever removed. Sending
   * the same tokens again does no harm, and they then count as unchanged.
   */
  loadTokenKinds(tokens: TokenKind[]): Promise<TokenKindsLoaded>;
}
