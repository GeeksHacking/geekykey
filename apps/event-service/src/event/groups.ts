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
  { name, capacity }: { name: string; capacity: number | null },
  now: Date,
): Promise<EventGroup | "name_taken"> {
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const taken = await tx
      .select({ name: participantGroups.name })
      .from(participantGroups)
      .for("update");
    if (taken.some((group) => sameGroupName(group.name, name))) return "name_taken";
    const group = { id: crypto.randomUUID(), name, tags: [], location: null, capacity };
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

/** The fewest joined participants Allocate takes for each group, so nobody is put in one alone. */
const MIN_PER_GROUP = 2;

/** Why Allocate placed nobody, as its 409 answers. */
export type AllocateRefusal =
  | { error: "no_groups" }
  | { error: "too_few_participants"; needed: number };

/**
 * Places everyone waiting, in an order `shuffle` gives, and moves nobody
 * already placed. Each goes to the group with the fewest members that still
 * has room, or, when every group is full, the group with the fewest members.
 * The oldest group wins a tie. The first time, it also starts allocation.
 *
 * It refuses, placing nobody and starting nothing, when there are no groups,
 * or fewer than 2 joined participants for each group.
 */
export async function allocateWaiting(
  db: Db,
  now: Date,
  shuffle: <T>(items: T[]) => T[],
): Promise<AllocateRefusal | null> {
  return db.transaction(async (tx) => {
    const { startedAt } = await lockAllocation(tx);
    const groups = await tx
      .select({ id: participantGroups.id, capacity: participantGroups.capacity })
      .from(participantGroups)
      .orderBy(asc(participantGroups.createdAt), asc(participantGroups.id))
      .for("update");
    if (groups.length === 0) return { error: "no_groups" };

    const members = await tx
      .select({ userId: groupMembers.userId, groupId: groupMembers.groupId })
      .from(groupMembers)
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId))
      .for("update");
    const needed = MIN_PER_GROUP * groups.length - members.length;
    if (needed > 0) return { error: "too_few_participants", needed };

    const places = groups.map(({ id, capacity }) => ({
      id,
      capacity,
      size: members.filter((member) => member.groupId === id).length,
      newcomers: [] as string[],
    }));
    const waiting = members.filter((member) => member.groupId === null);
    for (const { userId } of shuffle(waiting)) {
      const place = smallest(places.filter(hasRoom)) ?? smallest(places)!;
      place.size += 1;
      place.newcomers.push(userId);
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
    return null;
  });
}

/** A group as allocation counts it. */
interface Place {
  capacity: number | null;
  size: number;
}

/** Whether a group can take one more without passing its capacity. */
function hasRoom({ capacity, size }: Place): boolean {
  return capacity === null || size < capacity;
}

/** The group with the fewest members, the first in `places` on a tie, or none from an empty list. */
function smallest<P extends Place>(places: P[]): P | undefined {
  return places.reduce<P | undefined>(
    (best, place) => (best === undefined || place.size < best.size ? place : best),
    undefined,
  );
}

/** A copy of `items` in a random order (Fisher-Yates). */
export function shuffleAtRandom<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
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
