import type { LoginLink } from "@geekykey/login-link";
import { lt } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { errorCode } from "../lib/log.ts";
import { usedLoginLinks } from "./schema.ts";

/**
 * How long a used link's row outlives the link. A link read just before it
 * expires is still being used a moment after, and its row mustn't go before
 * then, or a second use of it at that moment would find no row and work.
 */
const KEEP_AFTER_EXPIRY_MS = 60_000;

/**
 * Marks `link` used, and says whether this was its first use: false when
 * it's been used before (the API agreement's 7.4). The jti is the table's
 * key, so of two uses at once, one insert fails. Rows of links long expired
 * go first, so the table holds only the last minute or two of links.
 */
export async function useLoginLink(db: Db, link: LoginLink, now = new Date()): Promise<boolean> {
  const longExpired = new Date(now.getTime() - KEEP_AFTER_EXPIRY_MS).toISOString();
  await db.delete(usedLoginLinks).where(lt(usedLoginLinks.expiresAt, longExpired));
  try {
    await db
      .insert(usedLoginLinks)
      .values({ jti: link.jti, expiresAt: link.expiresAt.toISOString() });
    return true;
  } catch (err) {
    if (errorCode(err) !== "ER_DUP_ENTRY") throw err;
    return false;
  }
}
