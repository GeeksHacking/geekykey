import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isoNow } from "../db/columns.ts";
import type { Db } from "../db/pool.ts";
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
