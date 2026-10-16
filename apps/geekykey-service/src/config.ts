import { z } from "zod";

/** An Event Service this Worker takes stations' taps for: one entry in EVENT_SERVICES. */
export interface EventServiceEntry {
  /** Short and stable, such as `showcase`. Log lines name the Event Service by it, and its key's setting is named after it. */
  id: string;
  /** For people, such as "Capstone Showcase". */
  name: string;
  /** Where its routes start, such as `https://event-api.geekshacking.com`, with no `/` at the end. */
  url: string;
  /**
   * The Event Service key its requests carry, from the secret
   * EVENT_SERVICE_KEY_<ID>. 64 lower-case hex characters, as `openssl rand
   * -hex 32` writes them.
   */
  key: string;
}

export interface Config {
  /** The Event Services whose stations this Worker takes taps from, and hands them to. */
  eventServices: EventServiceEntry[];
  /** Who owns each token, until the switch to the Portal's tag APIs. */
  claimsStandIn: {
    /** Where its routes start, such as `https://event-api.geekshacking.com/claims-stand-in/v1`. */
    url: string;
    /** The key its requests carry. 64 lower-case hex characters. */
    key: string;
  };
  /**
   * The GeekyKey admins, by user ID, who may release someone else's token.
   * Nothing reads it until checkpoint 6's release.
   */
  geekykeyAdmins: string[];
  maxTapsPerRequest: number;
  /**
   * Milliseconds a station's request has for its calls out: filling an empty
   * copy of the registered stations, finding its tokens' owners and the
   * hand-off, together (the API agreement's 11.5). The station waits 5
   * seconds, so this leaves it room for the network.
   */
  tapDeadlineMs: number;
  /** HMAC key the gk_session cookie is signed with, from checkpoint 5. Changing it signs everyone out. */
  sessionSecret: string;
}

/**
 * A setting that's missing or wrong. Thrown as the Worker starts, which stops
 * it starting, so its message names the setting and never says what it was
 * given, secret or not.
 */
export class ConfigError extends Error {
  override name = "ConfigError";
}

/**
 * The Worker's `env`: the settings under `vars` in wrangler.jsonc, which keep
 * their JSON types, and the secrets, which are strings. Locally, .dev.vars
 * can replace either, always as a string.
 */
type Env = Record<string, unknown>;

/** The setting called `name`, which must be there and not empty. */
function required(env: Env, name: string): unknown {
  const value = env[name];
  if (value === undefined || value === "") throw new ConfigError(`${name} is required`);
  return value;
}

/** A setting that holds JSON: as wrangler.jsonc gives it, or a string of it from .dev.vars. */
function jsonSetting(env: Env, name: string): unknown {
  const value = required(env, name);
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // Never JSON.parse's own message, which quotes the start of the value.
    throw new ConfigError(`${name} isn't valid JSON`);
  }
}

/** `value` checked against `schema`, or an error naming `name` and the first rule it broke. */
function checkedSetting<T>(name: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  // Such as "EVENT_SERVICES 0.url: must start with https://". Zod's messages
  // say what was expected, never what was given.
  const [issue] = result.error.issues;
  const where = issue!.path.length === 0 ? "" : ` ${issue!.path.join(".")}:`;
  throw new ConfigError(`${name}${where} ${issue!.message}`);
}

/** The hosts `http://` may go to: this machine, in local development. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * An address a key is sent to, which must start with `https://`, since the
 * key goes with every request (the API agreement's section 3). The one
 * exception is this machine, for local development. A deployed Worker can't
 * reach it, so it's never one there. The `/` at the end, if any, goes.
 */
const address = z
  .url({ protocol: /^https?$/, error: "must be a URL" })
  .refine(
    (url) => {
      // Zod runs this even when the check above fails, and says so itself.
      if (!URL.canParse(url)) return true;
      const { protocol, hostname } = new URL(url);
      return protocol === "https:" || LOOPBACK.has(hostname);
    },
    { message: "must start with https://, or be http:// to this machine" },
  )
  .transform((url) => url.replace(/\/+$/, ""));

const eventServicesSetting = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9_]+$/, "must be lower-case letters, digits and _"),
      name: z.string().min(1),
      url: address,
    }),
  )
  .min(1)
  .refine((entries) => new Set(entries.map(({ id }) => id)).size === entries.length, {
    message: "must not list an ID twice",
  });

const userIdsSetting = z.array(z.string().min(1));

/** A whole number above 0, as a number from wrangler.jsonc or a string from .dev.vars. */
function positiveIntFromEnv(env: Env, name: string): number {
  const value = required(env, name);
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
    throw new ConfigError(`${name} must be a whole number above 0`);
  }
  return number;
}

/** A key a request carries: 64 lower-case hex characters, as `openssl rand -hex 32` writes them. */
function keyFromEnv(env: Env, name: string): string {
  const key = required(env, name);
  if (typeof key !== "string" || !/^[0-9a-f]{64}$/.test(key)) {
    throw new ConfigError(`${name} must be 64 lower-case hex characters`);
  }
  return key;
}

/** Fails at start-up rather than signing sessions with a guessable secret. */
function sessionSecretFromEnv(env: Env): string {
  const secret = required(env, "SESSION_SECRET");
  if (typeof secret !== "string" || secret.length < 16) {
    throw new ConfigError("SESSION_SECRET must be at least 16 characters");
  }
  return secret;
}

/**
 * Every setting, read once as the Worker starts. A missing or malformed one
 * throws ConfigError, which stops it starting rather than failing every
 * request. `settings` is the Worker's `env`.
 */
export function loadConfig(settings: object): Config {
  const env = settings as Env;
  const eventServices = checkedSetting(
    "EVENT_SERVICES",
    eventServicesSetting,
    jsonSetting(env, "EVENT_SERVICES"),
  ).map((entry) => ({
    ...entry,
    key: keyFromEnv(env, `EVENT_SERVICE_KEY_${entry.id.toUpperCase()}`),
  }));
  return {
    eventServices,
    claimsStandIn: {
      url: checkedSetting("CLAIMS_STAND_IN_URL", address, required(env, "CLAIMS_STAND_IN_URL")),
      key: keyFromEnv(env, "CLAIMS_STAND_IN_KEY"),
    },
    geekykeyAdmins: checkedSetting(
      "GEEKYKEY_ADMINS",
      userIdsSetting,
      jsonSetting(env, "GEEKYKEY_ADMINS"),
    ),
    maxTapsPerRequest: positiveIntFromEnv(env, "MAX_TAPS_PER_REQUEST"),
    tapDeadlineMs: positiveIntFromEnv(env, "TAP_DEADLINE_MS"),
    sessionSecret: sessionSecretFromEnv(env),
  };
}
