export interface Config {
  /**
   * The database's `mysql://user:password@host:port/db` URL. The server uses
   * checked TLS unless the host is this machine (src/db/pool.ts).
   */
  databaseUrl: string;
  /** The port the server listens on. Cloud Run sets PORT itself. */
  port: number;
  /** Seconds a user must wait before a second tap at the same station counts. 0 disables. */
  tapCooldownSeconds: number;
  /**
   * Mounts POST /auth/dev-login, which signs in a seeded user without the
   * portal. Local development only, never true in production.
   */
  devAuthEnabled: boolean;
  /** HMAC key the event_session cookie is signed with. Changing it signs everyone out. */
  sessionSecret: string;
  /** `Secure` on the session cookie. A Secure cookie is never sent back over plain http. */
  sessionCookieSecure: boolean;
  /**
   * The key the GeekyKey Service's requests to the claims stand-in carry, and
   * the stand-in checks. 64 lower-case hex characters, as `openssl rand -hex 32`
   * writes them.
   */
  claimsStandInKey: string;
  /**
   * The key the GeekyKey Service's requests to the Event side carry, and the
   * Event side checks: the Event Service key. 64 lower-case hex characters,
   * as `openssl rand -hex 32` writes them.
   */
  eventServiceKey: string;
  /**
   * The Event side's organizers, by user ID. Everyone else is a participant.
   * Read once at start-up, and checked on every request.
   */
  organizers: string[];
}

/**
 * Stand-in secret for local development, where the only sessions are dev-login
 * ones and nothing needs protecting. Production must set SESSION_SECRET.
 */
const DEV_SESSION_SECRET = "geekykey-dev-session-secret-not-for-production";

/**
 * Stand-in for the two keys the GeekyKey Service's requests carry, in local
 * development. apps/geekykey-service/dev.env sends the same.
 */
const DEV_KEY = "0".repeat(64);

/** The local organizer list: the organizer the seed creates. */
const DEV_ORGANIZERS = ["dev-organizer-1"];

/**
 * A setting that's missing or wrong. The server logs its message as it stops
 * (src/server.ts), so the message names the setting, and never the value of
 * a secret one.
 */
export class ConfigError extends Error {
  override name = "ConfigError";
}

/**
 * Settings by name, as environment variables: `process.env` in the server.
 * Locally they come from dev.env, .env and the shell, and on Cloud Run from
 * the service's settings and Secret Manager.
 */
type Env = Record<string, string | undefined>;

/** The secrets APP_SECRETS may hold. Ordinary settings stay out, so a secret can't switch on dev sign-in. */
const APP_SECRET_NAMES = new Set([
  "SESSION_SECRET",
  "DATABASE_URL",
  "EVENT_SERVICE_KEY",
  "CLAIMS_STAND_IN_KEY",
]);

/**
 * `env` with APP_SECRETS, one JSON object of secrets by name, unpacked into
 * them. On Cloud Run each service keeps its secrets in one Secret Manager
 * secret, which is billed as one (spec section 5.1); locally they're separate
 * settings and there's no APP_SECRETS. No error quotes the JSON, since it's
 * all secret: even JSON.parse's own message would show the start of it.
 */
export function unpackAppSecrets(env: Env): Env {
  const raw = env.APP_SECRETS;
  if (raw === undefined || raw === "") return env;

  let secrets: unknown;
  try {
    secrets = JSON.parse(raw);
  } catch {
    throw new ConfigError("APP_SECRETS must be a JSON object, and isn't valid JSON");
  }
  if (typeof secrets !== "object" || secrets === null || Array.isArray(secrets)) {
    throw new ConfigError("APP_SECRETS must be a JSON object of secrets by name");
  }

  const unpacked: Env = { ...env };
  delete unpacked.APP_SECRETS;
  for (const [name, value] of Object.entries(secrets)) {
    if (!APP_SECRET_NAMES.has(name)) throw new ConfigError(`${name} can't be in APP_SECRETS`);
    if (typeof value !== "string") {
      throw new ConfigError(`${name} in APP_SECRETS must be a string`);
    }
    if (env[name] !== undefined) {
      throw new ConfigError(`${name} is set both in APP_SECRETS and on its own`);
    }
    unpacked[name] = value;
  }
  return unpacked;
}

function intFromEnv(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new ConfigError(`${key} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

function boolFromEnv(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new ConfigError(`${key} must be true or false, got "${raw}"`);
}

/** Fails at boot rather than serving forgeable sessions with a default secret. */
function sessionSecretFromEnv(env: Env, devAuthEnabled: boolean): string {
  const secret = env.SESSION_SECRET;
  if (secret) {
    if (secret.length < 16) {
      throw new ConfigError("SESSION_SECRET must be at least 16 characters");
    }
    return secret;
  }
  if (devAuthEnabled) return DEV_SESSION_SECRET;
  throw new ConfigError("SESSION_SECRET is required unless DEV_AUTH_ENABLED is true");
}

/**
 * A key the GeekyKey Service's requests carry. Fails at boot rather than
 * starting with a key that can't be the one in Secret Manager, and never
 * says what it was given.
 */
function keyFromEnv(env: Env, name: string, devAuthEnabled: boolean): string {
  const key = env[name];
  if (key) {
    if (!/^[0-9a-f]{64}$/.test(key)) {
      throw new ConfigError(`${name} must be 64 lower-case hex characters`);
    }
    return key;
  }
  if (devAuthEnabled) return DEV_KEY;
  throw new ConfigError(`${name} is required unless DEV_AUTH_ENABLED is true`);
}

/**
 * A list of user IDs, separated by commas, such as ORGANIZERS. Empty means
 * nobody. Unset means nobody too, except in local development, where it's
 * `devList`.
 */
function userIdsFromEnv(env: Env, key: string, devAuthEnabled: boolean, devList: string[]) {
  const raw = env[key];
  if (raw === undefined) return devAuthEnabled ? devList : [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/**
 * No default: a server that can't reach its database shouldn't start. Checked
 * here rather than when the pool reads it, so the error never holds the URL,
 * whose password is in it.
 */
function databaseUrlFromEnv(env: Env): string {
  const url = env.DATABASE_URL;
  if (!url) throw new ConfigError("DATABASE_URL is required");
  if (!URL.canParse(url)) {
    throw new ConfigError("DATABASE_URL must be a mysql://user:password@host:port/database URL");
  }
  return url;
}

/**
 * Every setting, read once at start-up. A bad or missing one throws, which
 * stops the server starting rather than failing every request.
 */
export function loadConfig(env: Env): Config {
  const devAuthEnabled = boolFromEnv(env, "DEV_AUTH_ENABLED", false);
  return {
    databaseUrl: databaseUrlFromEnv(env),
    port: intFromEnv(env, "PORT", 8000),
    tapCooldownSeconds: intFromEnv(env, "TAP_COOLDOWN_SECONDS", 300),
    devAuthEnabled,
    sessionSecret: sessionSecretFromEnv(env, devAuthEnabled),
    // Dev auth means a developer on http://localhost, where a Secure cookie never comes back.
    sessionCookieSecure: !devAuthEnabled,
    claimsStandInKey: keyFromEnv(env, "CLAIMS_STAND_IN_KEY", devAuthEnabled),
    eventServiceKey: keyFromEnv(env, "EVENT_SERVICE_KEY", devAuthEnabled),
    organizers: userIdsFromEnv(env, "ORGANIZERS", devAuthEnabled, DEV_ORGANIZERS),
  };
}
