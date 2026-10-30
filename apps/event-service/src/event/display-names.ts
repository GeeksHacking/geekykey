import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isoNow } from "../db/columns.ts";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { users } from "./schema.ts";

/*
  The name the event shows for a user, on the passport, the scan log and the
  export. It comes from their login until they set one themselves, and from
  then on a login never replaces it (the API agreement's 7.2 and 8.7). A login
  with no name, such as a guest's, gives a new user DEFAULT_DISPLAY_NAME.
*/

/** A new user's name when their login has none (the API agreement's 7.2). */
export const DEFAULT_DISPLAY_NAME = "Guest";

/** The longest name a user can set, in Unicode code points (the API agreement's 8.7). */
const DISPLAY_NAME_MAX = 30;

/** A name the user sets: trimmed, then 1 to 30 code points, in any script. */
export const displayNameSchema = z
  .string()
  .trim()
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  .refine(
    (name) => name !== "" && [...name].length <= DISPLAY_NAME_MAX,
    `display_name must be 1 to ${DISPLAY_NAME_MAX} characters`,
  );

/**
 * Whether the user has a name of their own, which is `has_name` on GET
 * /api/v1/me: false while they have the default, which neither a login nor
 * they gave. A name they set counts, even if it is `Guest`.
 */
export function hasName(user: { displayName: string; nameSetAt: string | null }): boolean {
  return user.nameSetAt !== null || user.displayName !== DEFAULT_DISPLAY_NAME;
}

/**
 * The name a station's screen greets each of `userIds` by (the API
 * agreement's 6.1), for those it has one for: the first word of the name the
 * event shows, with accents taken off, and only while they have a name of
 * their own (hasName). The screen shows only printable ASCII, so a name it
 * can't show, such as one in Chinese characters, is left out, and so is a
 * user who has never logged in to this Event Service. `db` may be an
 * ingest's transaction.
 */
export async function stationNames(
  db: Db | Tx,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, nameSetAt: users.nameSetAt })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]));
  const names = new Map<string, string>();
  for (const user of rows) {
    if (!hasName(user)) continue;
    const [firstWord = ""] = user.displayName.trim().split(/\s+/u);
    const plain = firstWord.normalize("NFD").replace(/\p{M}/gu, "");
    if (/^[\x21-\x7E]+$/.test(plain)) names.set(user.id, plain);
  }
  return names;
}

/**
 * Creates the user's row at login, or updates the name on it to the login's.
 * A login with no name leaves a returning user's name as it is, and gives a
 * new user DEFAULT_DISPLAY_NAME. Neither replaces a name the user set. One
 * statement, so two logins at once can't both try to create the row.
 */
export async function saveLogin(db: Db, userId: string, loginName: string | null): Promise<void> {
  await db
    .insert(users)
    .values({ id: userId, displayName: loginName ?? DEFAULT_DISPLAY_NAME })
    .onDuplicateKeyUpdate({
      set:
        loginName === null
          ? { id: sql`${users.id}` }
          : // Here a column means the row already there, so a name the user set stays.
            {
              displayName: sql`IF(${users.nameSetAt} IS NULL, ${loginName}, ${users.displayName})`,
            },
    });
}

/** Sets the name the user chose, which a login never replaces from now on. */
export async function setOwnName(db: Db, userId: string, name: string): Promise<void> {
  await db
    .update(users)
    .set({ displayName: name, nameSetAt: isoNow() })
    .where(eq(users.id, userId));
}
