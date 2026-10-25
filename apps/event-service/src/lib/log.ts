/**
 * Every log line the server writes, by its fixed name, with how serious it
 * is. A new line gets its name here first, so the names stay a fixed set
 * that a saved query in Cloud Logging can count and group.
 */
const LOG_LINES = {
  server_started: "INFO",
  server_stopping: "INFO",
  internal_error: "ERROR",
  fatal_error: "ERROR",
  // A tap the Event side stored, with enough to store it again after a restore.
  tap_stored: "INFO",
  // An organizer created a station, replaced its key, disabled it or enabled it: who, and which
  // station. Never the key.
  station_created: "INFO",
  station_key_replaced: "INFO",
  station_disabled: "INFO",
  station_enabled: "INFO",
  // A Firebase login answered 503, because Google's keys couldn't be fetched to check the token.
  login_unavailable: "ERROR",
} as const;

export type LogName = keyof typeof LOG_LINES;

/**
 * What a log line carries besides its name: plain values only, so a whole
 * user, request or error can't slip in with a name or a key inside it.
 */
export type LogFields = Record<
  string,
  string | number | boolean | null | undefined | readonly string[]
> & { severity?: never; message?: never };

/**
 * Writes one log line: one JSON object on one line, whose `message` is its
 * fixed name. Cloud Logging takes `severity` as the entry's severity and
 * shows `message` as its headline.
 *
 * Never put a key, a cookie or a name in `fields`. A user ID, a station ID or
 * a token's UID is fine.
 */
export function log(name: LogName, fields: LogFields = {}): void {
  const severity = LOG_LINES[name];
  const line = JSON.stringify({ severity, message: name, ...fields });
  if (severity === "ERROR") console.error(line);
  else console.log(line);
}

/**
 * What a log line may say about an error: its class, its code (such as
 * `ER_LOCK_WAIT_TIMEOUT` or `ECONNRESET`) and where it was thrown, but never
 * its message. A database error's message holds the query's values, which
 * can include a name.
 */
export function errorFields(err: unknown): LogFields {
  if (!(err instanceof Error)) return { error: typeof err };
  return {
    error: err.name,
    code: errorCode(err),
    // Only the "at ..." lines. The lines above them repeat the message.
    stack: err.stack
      ?.split("\n")
      .filter((line) => /^\s+at /.test(line))
      .map((line) => line.trim()),
  };
}

/**
 * The first `code` on the error or on what caused it, such as mysql2's
 * `ER_DUP_ENTRY`: Drizzle keeps mysql2's error as the cause.
 */
export function errorCode(err: unknown): string | undefined {
  let current: unknown = err;
  // A few causes deep at most, in case one points back at another.
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = current.cause;
  }
  return undefined;
}
