import { sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { userKinds } from "./schema.ts";

/** A user, and the kind the GeekyKey Service gave with them. */
export interface SeenKind {
  userId: string;
  kind: string;
}

/**
 * Keeps each user's kind (ADR 0006), as a tap's hand-off or a login link gave
 * it. The first kind seen stays: a user already with a kind keeps it, and of
 * two kinds for one user in `seen`, the first does. One write, for any number
 * of users, and none when `seen` is empty.
 */
export async function keepKinds(db: Db | Tx, seen: readonly SeenKind[]): Promise<void> {
  const firsts = new Map<string, string>();
  for (const { userId, kind } of seen) if (!firsts.has(userId)) firsts.set(userId, kind);
  if (firsts.size === 0) return;
  const createdAt = new Date().toISOString();
  // A user with a kind already keeps it: the no-op update is only so that never fails the
  // write. Never INSERT IGNORE, which would also store bad values without a word.
  await db
    .insert(userKinds)
    .values([...firsts].map(([userId, kind]) => ({ userId, kind, createdAt })))
    .onDuplicateKeyUpdate({ set: { userId: sql`user_id` } });
}
