import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { groupAllocation, groupMembers, participantGroups, users } from "./schema.ts";

/*
  Participant groups (.scratch/participant-groups/spec.md): organizers make
  groups, participants join, and allocation places whoever has joined. Each
  participant is in at most one group, since group_members has one row each.
  All the placement rules live here, and the routes hold none.
*/

/** The one row of group_allocation. */
const ALLOCATION_ROW = 1;

/** A group as the organizers' board lists it. */
export type EventGroup = Awaited<ReturnType<typeof loadGroupBoard>>["groups"][number];

/**
 * Locks the allocation row until `tx` ends, making it first if the
 * evening-before clear has emptied its table, and gives when allocation
 * started. Every write that changes who is in a group calls this first, so
 * those writes take turns, across the service's instances too (the spec's
 * "Concurrency").
 *
 * On TiDB, a plain read after this sees the database as it was before the lock
 * was waited for, so every read after it is a locking read as well
 * (tap-pipeline.ts says more, at #lockStation).
 */
async function lockAllocation(tx: Tx): Promise<{ startedAt: string | null }> {
  await tx
    .insert(groupAllocation)
    .values({ id: ALLOCATION_ROW })
    // The row already being there is no failure. Never INSERT IGNORE, as user-kinds.ts says.
    .onDuplicateKeyUpdate({ set: { id: sql`${groupAllocation.id}` } });
  const [row] = await tx
    .select({ startedAt: groupAllocation.startedAt })
    .from(groupAllocation)
    .where(eq(groupAllocation.id, ALLOCATION_ROW))
    .for("update");
  return { startedAt: row?.startedAt ?? null };
}

/** Whether two names would confuse participants: the same, whatever their capitals. */
function sameGroupName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Makes a group with this name, or gives `"name_taken"` when another has it,
 * whatever its capitals. The check is here rather than in a collation, since
 * the ones that ignore case treat every emoji as the same character. It takes
 * the allocation lock, so of two at once, the second sees the first.
 */
export async function createGroup(
  db: Db,
  name: string,
  now: Date,
): Promise<EventGroup | "name_taken"> {
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const taken = await tx
      .select({ name: participantGroups.name })
      .from(participantGroups)
      .for("update");
    if (taken.some((group) => sameGroupName(group.name, name))) return "name_taken";
    const group = { id: crypto.randomUUID(), name, tags: [], location: null, capacity: null };
    await tx.insert(participantGroups).values({ ...group, createdAt: now.toISOString() });
    return { ...group, members: [] };
  });
}

/** Joins the user, who then waits. Someone who has already joined keeps their place. */
export async function joinGroups(db: Db, userId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAllocation(tx);
    await tx
      .insert(groupMembers)
      .values({ userId, joinedAt: now.toISOString() })
      .onDuplicateKeyUpdate({ set: { userId: sql`${groupMembers.userId}` } });
  });
}

/**
 * Places everyone waiting, each in the group with the fewest members, the
 * oldest group on a tie, and moves nobody already placed. The first time, it
 * also starts allocation. With no groups, it does neither.
 */
export async function allocateWaiting(db: Db, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const { startedAt } = await lockAllocation(tx);
    const groups = await tx
      .select({ id: participantGroups.id })
      .from(participantGroups)
      .orderBy(asc(participantGroups.createdAt), asc(participantGroups.id))
      .for("update");
    if (groups.length === 0) return;

    const members = await tx
      .select({ userId: groupMembers.userId, groupId: groupMembers.groupId })
      .from(groupMembers)
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId))
      .for("update");
    const places = groups.map(({ id }) => ({
      id,
      size: members.filter((member) => member.groupId === id).length,
      newcomers: [] as string[],
    }));
    for (const member of members) {
      if (member.groupId !== null) continue;
      const smallest = places.reduce((best, place) => (place.size < best.size ? place : best));
      smallest.size += 1;
      smallest.newcomers.push(member.userId);
    }

    const placedAt = now.toISOString();
    for (const { id, newcomers } of places) {
      if (newcomers.length === 0) continue;
      await tx
        .update(groupMembers)
        .set({ groupId: id, placedAt, how: "allocated" })
        .where(inArray(groupMembers.userId, newcomers));
    }
    if (startedAt === null) {
      await tx
        .update(groupAllocation)
        .set({ startedAt: placedAt })
        .where(eq(groupAllocation.id, ALLOCATION_ROW));
    }
  });
}

/** When allocation started, or null before it has. */
async function allocationStartedAt(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ startedAt: groupAllocation.startedAt })
    .from(groupAllocation)
    .where(eq(groupAllocation.id, ALLOCATION_ROW));
  return row?.startedAt ?? null;
}

/** Everything the organizers' Groups screen shows, groups oldest first. */
export async function loadGroupBoard(db: Db) {
  const [startedAt, groups, members] = await Promise.all([
    allocationStartedAt(db),
    db
      .select({
        id: participantGroups.id,
        name: participantGroups.name,
        tags: participantGroups.tags,
        location: participantGroups.location,
        capacity: participantGroups.capacity,
      })
      .from(participantGroups)
      .orderBy(asc(participantGroups.createdAt), asc(participantGroups.id)),
    db
      .select({
        userId: groupMembers.userId,
        displayName: users.displayName,
        groupId: groupMembers.groupId,
        joinedAt: groupMembers.joinedAt,
        placedAt: groupMembers.placedAt,
        how: groupMembers.how,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId)),
  ]);
  return {
    startedAt,
    joinedCount: members.length,
    groups: groups.map((group) => ({
      ...group,
      members: members.filter((member) => member.groupId === group.id),
    })),
    waiting: members.filter((member) => member.groupId === null),
  };
}

/**
 * What a user sees of the groups: whether they've joined, and their own group
 * with its members' names. Never anyone's user ID, nor anyone else's group.
 */
export async function loadMyGroup(db: Db, userId: string) {
  const [startedAt, [mine]] = await Promise.all([
    allocationStartedAt(db),
    db
      .select({
        group: {
          id: participantGroups.id,
          name: participantGroups.name,
          tags: participantGroups.tags,
          location: participantGroups.location,
        },
      })
      .from(groupMembers)
      .leftJoin(participantGroups, eq(participantGroups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, userId))
      .limit(1),
  ]);
  const allocationStarted = startedAt !== null;
  if (!mine) return { status: "not_joined" as const, allocationStarted, group: null };
  if (!mine.group) return { status: "waiting" as const, allocationStarted, group: null };
  const members = await db
    .select({ displayName: users.displayName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, mine.group.id))
    .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId));
  return { status: "placed" as const, allocationStarted, group: { ...mine.group, members } };
}
