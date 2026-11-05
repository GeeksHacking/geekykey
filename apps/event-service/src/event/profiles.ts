import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { users } from "./schema.ts";

/*
  What a user writes for the people they connect with: a bio and one contact
  line (the API agreement's 8.7, BAC-147). Both are optional, and nothing checks
  what they say. /me gives a person's own values (8.1), and their current values
  to whoever has connected with them, and no other answer gives a contact line.
*/

/** The longest bio and contact line a user can set, in Unicode code points (8.7). */
const BIO_MAX = 160;
const CONTACT_LINE_MAX = 80;

/** Trimmed, then at most `max` code points. Blank clears it, as null does. */
const optionalTextSchema = (field: string, max: number) =>
  z
    .string()
    .trim()
    // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
    .refine((text) => [...text].length <= max, `${field} must be at most ${max} characters`)
    .transform((text) => (text === "" ? null : text))
    .nullable();

export const bioSchema = optionalTextSchema("bio", BIO_MAX);
export const contactLineSchema = optionalTextSchema("contact_line", CONTACT_LINE_MAX);

/** Sets whichever of the two is given, and clears one given as null. */
export async function setProfile(
  db: Db | Tx,
  userId: string,
  profile: { bio?: string | null; contactLine?: string | null },
): Promise<void> {
  if (profile.bio === undefined && profile.contactLine === undefined) return;
  await db.update(users).set(profile).where(eq(users.id, userId));
}
