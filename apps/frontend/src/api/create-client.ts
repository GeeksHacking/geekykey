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

/**
 * The methods that talk to the real backend. Add a line here when a slice is
 * done, and only then: an endpoint that is not live in apps/backend yet will
 * fail every screen that calls it.
 */
function liveMethods(http: ApiClient): Partial<ApiClient> {
  return {
    // loginUrl builds a URL and sends no request, so both clients return the
    // same string. It sits here as the worked example of the pattern.
    loginUrl: (returnTo) => http.loginUrl(returnTo),

    // The backend session and resource routes are not available yet. Keep the
    // live slice empty rather than mixing a live me() with mock login methods.
  };
}

export function createAppClient(): ApiClient {
  const mock = createMockClient({ simulate: !LIVE_API });
  if (!LIVE_API) return mock;
  // Do not let a previous mock sign-in survive a reload into live mode.
  mock.mock.setSession(null);
  return { ...mock, ...liveMethods(createHttpClient()) };
}
