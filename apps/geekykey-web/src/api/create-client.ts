import type { ApiClient } from "@/api/client";
import { createHttpClient } from "@/api/http/client";
import { createMockClient } from "@/api/mock/client";

/*
  Which client the app runs on, and the only file that changes when an endpoint
  goes live.

  Unlike apps/frontend, liveMethods() is empty. The GeekyKey Service's routes
  arrive at checkpoint 6, so until then every method runs on the mock whether or
  not VITE_LIVE_API is set. Add one line per endpoint as each slice lands; see
  "Wiring an endpoint to the real backend" in apps/frontend/CLAUDE.md.
*/
const LIVE_API = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

export interface AppClientOptions {
  /** Overrides VITE_LIVE_API in tests; application code uses the environment default. */
  live?: boolean;
}

/**
 * The methods that talk to the real backend. Empty on purpose: adding a line here
 * before apps/event-service answers with that shape will break every screen that
 * calls it.
 */
function liveMethods(http: ApiClient): Partial<ApiClient> {
  // Nothing to send live yet. Each endpoint adds one line here, e.g. `me: () => http.me()`.
  void http;
  return {};
}

/** The names in liveMethods(). The "Demo data" notice reads this, so it never needs its own list. */
export const LIVE_METHODS: ReadonlySet<keyof ApiClient> = new Set(
  Object.keys(liveMethods({} as ApiClient)) as (keyof ApiClient)[],
);

export function createAppClient({ live = LIVE_API }: AppClientOptions = {}): ApiClient {
  const mock = createMockClient();
  if (!live) return mock;

  // The mock keeps the session so a screen can still work against fixtures, the way
  // apps/frontend mirrors it during the staged migration.
  mock.mock.setSession(null);
  const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
  // Spreading the (empty) live set is what switches methods over, one slice at a time.
  return { ...mock, ...liveMethods(http) };
}
