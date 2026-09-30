/**
 * The two databases in the TiDB that the root compose.yaml starts:
 * geekykey_dev for `wrangler dev` and the seed, and geekykey_test for the
 * tests. They are kept apart so that running the tests never wipes the data
 * you develop with.
 */
export const LOCAL_DATABASES = ["geekykey_dev", "geekykey_test"] as const;

export type LocalDatabase = (typeof LOCAL_DATABASES)[number];

/**
 * The backend's login to one of them, which create-databases.ts makes. The
 * password isn't a secret: TiDB only listens on this machine, and holds only
 * dev data. wrangler.jsonc spells out the geekykey_dev one again, since JSON
 * can't import it.
 */
export function localDatabaseUrl(name: LocalDatabase): string {
  return `mysql://geekykey:geekykey@127.0.0.1:4000/${name}`;
}
