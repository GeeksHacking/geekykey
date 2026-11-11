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
 * The user's current name, or null when they have no name of their own (hasName)
 * or have never logged in to this Event Service. Finishing setup needs one.
 */
export async function ownNameOf(db: Db | Tx, userId: string): Promise<string | null> {
  const [user] = await db
    .select({ displayName: users.displayName, nameSetAt: users.nameSetAt })
    .from(users)
    .where(eq(users.id, userId));
  return user !== undefined && hasName(user) ? user.displayName : null;
}

/**
 * The name the user's login gave them, which a login link to the GeekyKey
 * screens carries (the API agreement's 8.12): their name while it still came
 * from a login, or null once they set their own, while they have the default,
 * as a guest does, or when they have never logged in to this Event Service.
 */
export async function loginNameOf(db: Db, userId: string): Promise<string | null> {
  const [user] = await db
    .select({ displayName: users.displayName, nameSetAt: users.nameSetAt })
    .from(users)
    .where(eq(users.id, userId));
  return user !== undefined && user.nameSetAt === null && hasName(user) ? user.displayName : null;
}

/**
 * The name a station's screen greets each of `userIds` by (the API
 * agreement's 6.1), for those it has one for: the first word of the name the
 * event shows, with accents taken off, and only while they have a name of
 * their own (hasName). The screen shows only printable ASCII, so a name it
 * can't show, such as one in Chinese characters, is left out, and so is a
 * user who has never logged in to this Event Service. `db` may be an
 * ingest's transaction. With `lock`, sees names committed after its lock wait.
 */
export async function greetingNames(
  db: Db | Tx,
  userIds: readonly string[],
  { lock = false } = {},
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const query = db
    .select({ id: users.id, displayName: users.displayName, nameSetAt: users.nameSetAt })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]));
  const rows = await (lock ? query.for("update") : query);
  const names = new Map<string, string>();
  for (const user of rows) {
    if (!hasName(user)) continue;
    const [firstWord = ""] = user.displayName.trim().split(/\s+/u);
    const plain = forTheScreen(firstWord);
    // The first word has no spaces, so it's one the screen shows whole or not at all.
    if (plain !== null) names.set(user.id, plain);
  }
  return names;
}

/**
 * `text` with its accents taken off, as a station's screen can show it (the
 * API agreement's 6.1), or null when it still has a character the screen
 * can't show, such as a Chinese character or an emoji, or is empty.
 */
export function forTheScreen(text: string): string | null {
  const plain = text.normalize("NFD").replace(/\p{M}/gu, "");
  return /^[\x20-\x7E]+$/.test(plain) ? plain : null;
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

/**
 * Whether two names would confuse people: the same after trimming, whatever their capitals. It
 * trims both, since a name from a login is stored as it came.
 */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Sets the name the user chose, which a login never replaces from now on, or
 * gives `"name_taken"` when someone else has it (the API agreement's 8.7). The
 * default name is nobody's (hasName), and saving a name of their own again
 * works even when someone had it before this rule.
 *
 * It locks every user's row, not only the ones with this name, since TiDB
 * locks only the rows a read finds and two saves at once would find none. So
 * of two at once, the second sees the first. The check is here rather than in
 * a collation for the reason createGroup() gives (groups.ts).
 */
export async function setOwnName(
  tx: Tx,
  userId: string,
  name: string,
): Promise<"name_taken" | null> {
  const everyone = await tx
    .select({ id: users.id, displayName: users.displayName, nameSetAt: users.nameSetAt })
    .from(users)
    .for("update");
  const sameNamed = everyone.filter((user) => hasName(user) && sameName(user.displayName, name));
  const alreadyTheirs = sameNamed.some((user) => user.id === userId);
  if (sameNamed.length > 0 && !alreadyTheirs) return "name_taken";
  await tx
    .update(users)
    .set({ displayName: name, nameSetAt: isoNow() })
    .where(eq(users.id, userId));
  return null;
}
