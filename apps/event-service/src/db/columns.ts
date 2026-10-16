import { varchar } from "drizzle-orm/mysql-core";

/**
 * The column types for the schema files, src/event/schema.ts and
 * src/claims-stand-in/schema.ts, so a user ID or a timestamp is stored the
 * same way in both.
 */

/**
 * Timestamps are ISO 8601 UTC strings with milliseconds, as
 * `Date.prototype.toISOString()` writes them, not DATETIME. They were strings
 * on SQLite, so the code, the sort order and what the API sends stay the same
 * after the move. A string can't have a database default, so the code sets it.
 */
export const isoTimestamp = (name: string) => varchar(name, { length: 24 });
export const isoNow = () => new Date().toISOString();

// Lengths for keys and indexed columns, which MySQL needs.
/** The longest `user_id` dev-login accepts. Portal user IDs are GUIDs. */
export const userId = (name: string) => varchar(name, { length: 128 });
/** `crypto.randomUUID()` in the seed. */
export const stationId = (name: string) => varchar(name, { length: 64 });
/** The taps route accepts UIDs of 4 to 10 bytes, in hex. */
export const tokenUid = (name: string) => varchar(name, { length: 20 });
