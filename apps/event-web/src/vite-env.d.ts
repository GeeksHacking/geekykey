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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
