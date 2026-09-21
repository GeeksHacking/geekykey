/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * "1" or "true" sends the methods listed in src/api/create-client.ts to the
   * real backend. Anything else, including unset, keeps the whole app on the
   * mock client. Set by `pnpm dev:live`.
   */
  readonly VITE_LIVE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
