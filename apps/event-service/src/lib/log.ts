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
  // An organizer created a station, replaced its key, disabled it, enabled it, added it to the
  // passport or changed its passport settings: who, and which station. Never the key.
  station_created: "INFO",
  station_key_replaced: "INFO",
  station_disabled: "INFO",
  station_enabled: "INFO",
  station_added_to_passport: "INFO",
  station_passport_changed: "INFO",
  // An organizer set the game a station runs: who, which station, and the game's ID, or null.
  station_game_changed: "INFO",
  // An organizer set the booth a station stands at: who, and which station.
  station_booth_changed: "INFO",
  // A station message failed, or had no open socket. Never its lines or the Event Service key.
  station_message_failed: "ERROR",
  // Work scheduled by a game failed after the ingest committed. Never its error or screen text.
  after_commit_failed: "ERROR",
  station_message_dropped: "INFO",
  // An organizer logged a tap for a participant through the QR fallback: who, at which station,
  // and its client_tap_id, which finds the tap's own tap_stored line.
  qr_fallback_logged: "INFO",
  // A Firebase login answered 503, because Google's keys couldn't be fetched to check the token.
  login_unavailable: "ERROR",
  // A user passed the limit on requests a minute and got 429: which user, by ID.
  rate_limited: "INFO",
  // A half of a connection the meeting hand-off brought (11.10): who tapped whose token, and its
  // status, so the halves and connections can be rebuilt after a restore, and counted.
  meeting_handled: "INFO",
  // An organizer created, changed or deleted a group, or pressed Allocate or Reset: who, and
  // which group for the first three.
  group_created: "INFO",
  group_changed: "INFO",
  group_deleted: "INFO",
  groups_allocated: "INFO",
  groups_reset: "INFO",
  // An organizer made the groups and allocated in one step, with the Groups screen's form: who,
  // and how many groups.
  groups_split: "INFO",
  // An organizer put someone in a group or sent them back to waiting, or removed them: who, whom,
  // and the group, or null for waiting.
  group_member_moved: "INFO",
  group_member_removed: "INFO",
  // An organizer switched what connections need, token kinds or groups (BAC-140): who, and to
  // which.
  connection_rule_changed: "INFO",
  // An organizer chose which challenge a new connection plays, random, dice or reaction
  // (BAC-161): who, and which.
  connection_challenge_changed: "INFO",
  // An organizer set or emptied the phrase (BAC-169): who, and how many words, 0 for none.
  phrase_changed: "INFO",
  // Someone accepted a connection request (8.10): who, who sent it, and the status, so with
  // meeting_handled the connections can be rebuilt after a restore, and counted.
  connection_request_accepted: "INFO",
  // Someone declined a connection request (8.10): who. The half that sent it is meeting_handled's.
  connection_request_declined: "INFO",
  // Someone played a connection's reaction test (8.11): who, and their time, or null for early.
  reaction_played: "INFO",
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
