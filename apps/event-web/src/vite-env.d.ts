/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * "1" or "true" sends the methods listed in src/api/create-client.ts to the
   * real backend. Anything else, including unset, keeps the whole app on the
   * mock client. Set by `pnpm dev:live`.
   */
  readonly VITE_LIVE_API?: string;

  /**
   * Prefix for the HTTP client's requests. Empty in every build: locally the
   * Vite proxy forwards /api and /auth, and in production the screens' Worker
   * does. Set it only if the topology changes to sibling subdomains, which
   * would also need CORS on the backend
   * (.scratch/db-hosting/issues/03-cloudflare-frontend.md:17).
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * Firebase's web config, for the showcase's login (agreement 7.2). The three names the
   * runbook's step 13 gives Julian, and none of it is secret: the API key only names the
   * project, and Firebase allows sign-in only from localhost, key.geekshacking.com and
   * event.geekshacking.com.
   */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
