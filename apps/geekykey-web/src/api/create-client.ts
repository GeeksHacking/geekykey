import type { ApiClient } from "@/api/client";
import { createHttpClient } from "@/api/http/client";
import { createMockClient } from "@/api/mock/client";

/*
  Which client the app runs on. With VITE_LIVE_API every method goes to the GeekyKey
  Service: the session, the token lookup, claiming and releasing (agreement 8.2, 8.3
  and 8.5), and the login link (8.6). Without it every method answers from the mock.
*/
export const LIVE_API = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

export interface AppClientOptions {
  /** Overrides VITE_LIVE_API in tests; application code uses the environment default. */
  live?: boolean;
}

export function createAppClient({ live = LIVE_API }: AppClientOptions = {}): ApiClient {
  if (!live) return createMockClient();
  return createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
}
