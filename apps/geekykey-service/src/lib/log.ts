/**
 * Every log line the Worker writes, by its fixed name, with how serious it
 * is. A new line gets its name here first, so the names stay a fixed set
 * that a query in Workers Logs can count and group.
 */
const LOG_LINES = {
  internal_error: "ERROR",
  // A station's tap by a token nobody owns, answered and stored nowhere.
  unknown_token: "INFO",
  // A station request failed because the token owners couldn't be had in time.
  claims_unavailable: "ERROR",
  // A station request failed because its Event Service didn't answer the hand-off properly in time.
  handoff_failed: "ERROR",
  // A station's heartbeat, already answered, that its Event Service didn't take properly in time.
  heartbeat_handoff_failed: "ERROR",
  // The copy of the registered stations was filled on a station's request.
  stations_copy_filled: "INFO",
  // An Event Service's registered stations couldn't be had. Its last good list, if any, is kept.
  stations_unavailable: "ERROR",
  // A registered station whose ID or key hash appears twice, in one list or in two, so its key is refused.
  station_refused: "ERROR",
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
 * fixed name, as the Event Service writes them. Workers Logs reads each
 * field of it, and takes how serious it is from console.error or
 * console.log.
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
 * `ECONNRESET`) and where it was thrown, but never its message, which might
 * hold a value from a request.
 */
export function errorFields(err: unknown): LogFields {
  if (!(err instanceof Error)) return { error: typeof err };
  return {
    error: err.name,
    code: "code" in err && typeof err.code === "string" ? err.code : undefined,
    // Only the "at ..." lines. The lines above them repeat the message.
    stack: err.stack
      ?.split("\n")
      .filter((line) => /^\s+at /.test(line))
      .map((line) => line.trim()),
  };
}
