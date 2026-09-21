export interface Config {
  port: number;
  /** libSQL URL. `file:` for local SQLite, `libsql://` for Turso. */
  databaseUrl: string;
  databaseAuthToken: string | undefined;
  /** Seconds a user must wait before a second tap at the same station counts. 0 disables. */
  tapCooldownSeconds: number;
  maxTapsPerRequest: number;
  /**
   * Mounts POST /auth/dev-login, which signs in a seeded user without the
   * portal. Local development only, never true in production.
   */
  devAuthEnabled: boolean;
  /** HMAC key the gk_session cookie is signed with. Changing it signs everyone out. */
  sessionSecret: string;
  /** `Secure` on the session cookie. A Secure cookie is never sent back over plain http. */
  sessionCookieSecure: boolean;
}

/**
 * Stand-in secret for local development, where the only sessions are dev-login
 * ones and nothing needs protecting. Production must set SESSION_SECRET.
 */
const DEV_SESSION_SECRET = "geekykey-dev-session-secret-not-for-production";

interface EnvReader {
  get(key: string): string | undefined;
}

function intFromEnv(env: EnvReader, key: string, fallback: number): number {
  const raw = env.get(key);
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

function boolFromEnv(env: EnvReader, key: string, fallback: boolean): boolean {
  const raw = env.get(key)?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${key} must be true or false, got "${raw}"`);
}

/** Fails at boot rather than serving forgeable sessions with a default secret. */
function sessionSecretFromEnv(env: EnvReader, devAuthEnabled: boolean): string {
  const secret = env.get("SESSION_SECRET");
  if (secret) {
    if (secret.length < 16) {
      throw new Error("SESSION_SECRET must be at least 16 characters");
    }
    return secret;
  }
  if (devAuthEnabled) return DEV_SESSION_SECRET;
  throw new Error("SESSION_SECRET is required unless DEV_AUTH_ENABLED is true");
}

export function loadConfig(env: EnvReader = Deno.env): Config {
  const devAuthEnabled = boolFromEnv(env, "DEV_AUTH_ENABLED", false);
  return {
    port: intFromEnv(env, "PORT", 8000),
    databaseUrl: env.get("DATABASE_URL") ?? "file:./data/geekykey.db",
    databaseAuthToken: env.get("DATABASE_AUTH_TOKEN") || undefined,
    tapCooldownSeconds: intFromEnv(env, "TAP_COOLDOWN_SECONDS", 300),
    maxTapsPerRequest: intFromEnv(env, "MAX_TAPS_PER_REQUEST", 500),
    devAuthEnabled,
    sessionSecret: sessionSecretFromEnv(env, devAuthEnabled),
    // Dev auth means a developer on http://localhost, where a Secure cookie never comes back.
    sessionCookieSecure: !devAuthEnabled,
  };
}
