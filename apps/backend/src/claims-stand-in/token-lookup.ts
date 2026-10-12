import { and, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { tokens } from "./schema.ts";

/**
 * Resolves NFC token UIDs to user IDs.
 *
 * The local implementation reads the tokens table. A portal-backed
 * implementation can replace it once the GeeksHacking integration lands,
 * without touching the tap pipeline or routes.
 */
export interface TokenResolver {
  /** UIDs must already be normalised. UIDs missing from the result are unknown or revoked. */
  resolveMany(uids: string[]): Promise<Map<string, string>>;
}

export class LocalTokenResolver implements TokenResolver {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async resolveMany(uids: string[]): Promise<Map<string, string>> {
    if (uids.length === 0) return new Map();
    const rows = await this.#db
      .select({ uid: tokens.uid, userId: tokens.userId })
      .from(tokens)
      .where(and(isNull(tokens.revokedAt), inArray(tokens.uid, uids)));
    return new Map(rows.map((row) => [row.uid, row.userId]));
  }
}

/** Strips separators readers commonly emit ("04:A1:B2" or "04 a1 b2") and upper-cases the hex. */
export function normaliseUid(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}
