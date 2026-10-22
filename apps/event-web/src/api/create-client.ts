import type { ApiClient } from "@/api/client";
import { isApiErrorCode } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";
import { createMockClient, type MockControls } from "@/api/mock/client";

/*
  Which client the app runs on, and the only file that changes when an endpoint
  goes live.

  Without VITE_LIVE_API the whole app is the in-memory mock, exactly as before,
  so UI work never needs a backend running. With it, the methods listed in
  liveMethods() go to the real backend and everything else stays on the mock.
  That is what makes the migration one slice at a time instead of one big
  switch-over. See "Wiring an endpoint to the real backend" in CLAUDE.md.
*/
const LIVE_API = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

export interface AppClientOptions {
  /** Overrides VITE_LIVE_API in tests; application code uses the environment default. */
  live?: boolean;
}

/**
 * The names of the methods that talk to the real backend. Add one name here when
 * a slice is done, and only then: an endpoint that is not live in apps/event-service
 * yet will fail every screen that calls it. The session slice is live; the
 * organiser's resource methods join as their routes land.
 */
const LIVE_METHOD_NAMES = [
  "me",
  "setDisplayName",
  "devLogin",
  "firebaseLogin",
  "loginLink",
  "logout",
] as const;

/**
 * The live methods, as a set. The "Demo data" notice and the tests read this, so
 * they never need a list of their own.
 */
export const LIVE_METHODS: ReadonlySet<keyof ApiClient> = new Set(LIVE_METHOD_NAMES);

/**
 * The live methods. The service's cookie is the session from now on, so the mock
 * has none of its own to begin with, and the mock's session follows the live one:
 * the methods that wait for their own slice still have to know who the user is.
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

    // Agreement 8.7. The name changes nothing the mock's methods need to know.
    setDisplayName: (input) => http.setDisplayName(input),

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

    // A link that fails leaves the service's cookie as it was (agreement 7.4), so the
    // mock keeps its session too. One that works logs in the link's user, so the mock's
    // session goes, as for firebaseLogin, and follows the live /me read straight afterwards.
    loginLink: async (link) => {
      await http.loginLink(link);
      mock.setSession(null);
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
  const mock = createMockClient({ simulate: !live });
  if (!live) return mock;

  // Keep the mock resource methods usable during the staged live slice. The HTTP
  // cookie remains authoritative; this mirror is only for methods whose backend
  // route has not been enabled yet.
  mock.mock.setSession(null);
  const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
  return { ...mock, ...liveMethods(http, mock.mock) };
}
