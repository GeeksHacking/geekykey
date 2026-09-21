export interface Config {
  port: number;
  /** libSQL URL. `file:` for local SQLite, `libsql://` for Turso. */
  databaseUrl: string;
  databaseAuthToken: string | undefined;
  /** Seconds a user must wait before a second tap at the same station counts. 0 disables. */
  tapCooldownSeconds: number;
  maxTapsPerRequest: number;
}

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

export function loadConfig(env: EnvReader = Deno.env): Config {
  return {
    port: intFromEnv(env, "PORT", 8000),
    databaseUrl: env.get("DATABASE_URL") ?? "file:./data/geekykey.db",
    databaseAuthToken: env.get("DATABASE_AUTH_TOKEN") || undefined,
    tapCooldownSeconds: intFromEnv(env, "TAP_COOLDOWN_SECONDS", 300),
    maxTapsPerRequest: intFromEnv(env, "MAX_TAPS_PER_REQUEST", 500),
  };
}
