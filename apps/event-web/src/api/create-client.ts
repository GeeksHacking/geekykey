import type { ApiClient } from "@/api/client";
import { createHttpClient } from "@/api/http/client";
import { createMockClient } from "@/api/mock/client";

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
 * The methods that talk to the real backend. Add a line here when a slice is
 * done, and only then: an endpoint that is not live in apps/backend yet will
 * fail every screen that calls it.
 */
function liveMethods(http: ApiClient): Partial<ApiClient> {
  return {
    // Session endpoints are now implemented and tested on the backend. Keep the
    // resource methods mocked until their corresponding routes land as a complete slice.
    me: () => http.me(),
    devLogin: (userId) => http.devLogin(userId),
    logout: () => http.logout(),

    // loginUrl builds a URL and sends no request, so both clients return the
    // same string. It sits here as the worked example of the pattern.
    loginUrl: (returnTo) => http.loginUrl(returnTo),
  };
}

/** The names in liveMethods(). The "Demo data" notice reads this, so it never needs its own list. */
export const LIVE_METHODS: ReadonlySet<keyof ApiClient> = new Set(
  Object.keys(liveMethods({} as ApiClient)) as (keyof ApiClient)[],
);

export function createAppClient({ live = LIVE_API }: AppClientOptions = {}): ApiClient {
  const mock = createMockClient({ simulate: !live });
  if (!live) return mock;

  // Keep the mock resource methods usable during the staged live slice. The HTTP
  // cookie remains authoritative; this mirror is only for methods whose backend
  // route has not been enabled yet.
  mock.mock.setSession(null);
  const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
  return {
    ...mock,
    ...liveMethods(http),
    me: async () => {
      try {
        const me = await http.me();
        mock.mock.setSession(me.user.id);
        return me;
      } catch (error) {
        mock.mock.setSession(null);
        throw error;
      }
    },
    devLogin: async (userId) => {
      try {
        await http.devLogin(userId);
        mock.mock.setSession(userId);
      } catch (error) {
        mock.mock.setSession(null);
        throw error;
      }
    },
    logout: async () => {
      try {
        await http.logout();
      } finally {
        mock.mock.setSession(null);
      }
    },
  };
}
