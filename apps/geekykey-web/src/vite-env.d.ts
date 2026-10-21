/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * "1" or "true" sends the methods listed in src/api/create-client.ts to the
   * real backend. Anything else, including unset, keeps the whole app on the
   * mock client. Set by `pnpm dev:live`.
   */
  readonly VITE_LIVE_API?: string;

  /**
   * Firebase's web config, for the showcase's login (agreement 7.2). The four names the
   * runbook's step 13 gives Julian, and none of it is secret: the API key only names the
   * project, and Firebase allows sign-in only from localhost, key.geekshacking.com and
   * event.geekshacking.com.
   */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
