import type { ApiClient } from "@/api/client";
import { isApiErrorCode } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";
import { createMockClient, type MockControls } from "@/api/mock/client";

/*
  Which client the app runs on, and the only file that changes when an endpoint
  goes live.

  With VITE_LIVE_API the session slice goes to the real backend: me, devLogin,
  firebaseLogin and logout. Every other method stays on the mock, because the
  GeekyKey Service's token routes (agreement 8.2, 8.3 and 8.5) arrive at
  checkpoint 6. See "Wiring an endpoint to the real backend" in
  apps/event-web/CLAUDE.md.
*/
export const LIVE_API = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

export interface AppClientOptions {
  /** Overrides VITE_LIVE_API in tests; application code uses the environment default. */
  live?: boolean;
}

/**
 * The names of the methods that talk to the real backend. Add one name here when
 * a slice is done, and only then: an endpoint that is not live in
 * apps/geekykey-service yet will break every screen that calls it. The session
 * slice is live; the token methods (agreement 8.2, 8.3 and 8.5) join at
 * checkpoint 6.
 */
const LIVE_METHOD_NAMES = ["me", "devLogin", "firebaseLogin", "logout"] as const;

/**
 * The live methods, as a set. The "Demo data" notice, My tokens' Release and the
 * tests read this, so a method that goes live changes them all at once.
 */
export const LIVE_METHODS: ReadonlySet<keyof ApiClient> = new Set(LIVE_METHOD_NAMES);

/**
 * The live methods. The service's cookie is the session from now on, so the mock
 * has none of its own to begin with, and the mock's session follows the live one:
 * the methods that wait for checkpoint 6 still have to know who the user is.
 */
function liveMethods(
  http: ApiClient,
  mock: MockControls,
): Pick<ApiClient, (typeof LIVE_METHOD_NAMES)[number]> {
  return {
    me: async () => {
      try {
        const me = await http.me();
        mock.setSession(me.user.id);
        return me;
      } catch (error) {
        // Only a 401 says the session is gone. A service that cannot answer says
        // nothing about the session, so the mock keeps the user it had.
        if (isApiErrorCode(error, "unauthenticated")) mock.setSession(null);
        throw error;
      }
    },

    // A dev login that fails leaves the service's cookie as it was, so the mock
    // keeps its session too, as me does on anything but a 401.
    devLogin: async (userId) => {
      await http.devLogin(userId);
      mock.setSession(userId);
    },

    // The service sets its own cookie, so the screens keep nothing. The mock's
    // session follows the live /me, which the screens read straight afterwards.
    firebaseLogin: async (idToken) => {
      // The mock's session goes before the request, not after it, so a /me that
      // cannot answer once the login is through cannot leave the mock signed in
      // as the user who was there before.
      mock.setSession(null);
      await http.firebaseLogin(idToken);
    },

    logout: async () => {
      try {
        await http.logout();
      } finally {
        mock.setSession(null);
      }
    },
  };
}

export function createAppClient({ live = LIVE_API }: AppClientOptions = {}): ApiClient {
  const mock = createMockClient();
  if (!live) return mock;

  // The mock keeps the session so a screen can still work against fixtures, the
  // way apps/event-web mirrors it during the staged migration.
  mock.mock.setSession(null);
  const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
  return { ...mock, ...liveMethods(http, mock.mock) };
}
