import type { ApiClient } from "@/api/client";
import { createHttpClient } from "@/api/http/client";
import { createMockClient } from "@/api/mock/client";

/*
  Which client the app runs on. With VITE_LIVE_API every method goes to the Event
  Service: the session (agreement 7.1 to 7.4, 8.1 and 8.7) and every organizer call
  (9.1 to 9.9). Without it every method answers from the in-memory mock, so UI work
  never needs a backend running.
*/
export const LIVE_API = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

export interface AppClientOptions {
  /** Overrides VITE_LIVE_API in tests; application code uses the environment default. */
  live?: boolean;
}

export function createAppClient({ live = LIVE_API }: AppClientOptions = {}): ApiClient {
  if (!live) return createMockClient({ simulate: true });
  return createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
}
