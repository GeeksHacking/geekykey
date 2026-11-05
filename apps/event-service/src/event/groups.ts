import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { loadConnectAcross } from "./connect-across.ts";
import type { Tx } from "./games.ts";
import { groupAllocation, groupMembers, participantGroups, users } from "./schema.ts";

/*
  Participant groups (.scratch/participant-groups/spec.md): organizers make
  groups, participants join, and allocation places whoever has joined. Each
  participant is in at most one group, since group_members has one row each.
  All the placement rules live here, and the routes hold none.
*/

/**
 * From config.organizers: the accounts kept out of every group (the spec's user story 52). Someone
 * added to the list after joining keeps their row, but no read counts or shows it, so they
 * aren't placed, take no place in a group's size, and read `not_joined`.
 */
export type Organizers = ReadonlySet<string>;

/** Leaves out the rows of group_members that belong to organizers. */
function participantsOnly(organizers: Organizers) {
  return organizers.size === 0 ? undefined : notInArray(groupMembers.userId, [...organizers]);
}

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

/** What an organizer sets on a group. */
export interface GroupFields {
  name: string;
  tags: string[];
  location: string | null;
  capacity: number | null;
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
  fields: GroupFields,
  now: Date,
): Promise<EventGroup | "name_taken"> {
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const taken = await tx
      .select({ name: participantGroups.name })
      .from(participantGroups)
      .for("update");
    if (taken.some((group) => sameGroupName(group.name, fields.name))) return "name_taken";
    const group = { id: crypto.randomUUID(), ...fields };
    await tx.insert(participantGroups).values({ ...group, createdAt: now.toISOString() });
    return { ...group, members: [] };
  });
}

/**
 * Sets every field of the group `id`, or gives `"not_found"` when there's no such group, or
 * `"name_taken"` when another group has the name, whatever its capitals. It moves nobody,
 * even when the capacity drops below the group's size, since nothing rebalances by itself (the
 * spec's "Placement rules"). It takes the allocation lock, as createGroup() does, so an edit
 * and a create at once can't both take one name.
 */
export async function editGroup(
  db: Db,
  id: string,
  fields: GroupFields,
): Promise<"not_found" | "name_taken" | null> {
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const groups = await tx
      .select({ id: participantGroups.id, name: participantGroups.name })
      .from(participantGroups)
      .for("update");
    if (!groups.some((group) => group.id === id)) return "not_found";
    if (groups.some((group) => group.id !== id && sameGroupName(group.name, fields.name))) {
      return "name_taken";
    }
    await tx.update(participantGroups).set(fields).where(eq(participantGroups.id, id));
    return null;
  });
}

/**
 * Deletes the group `id` and sends its members back to waiting, to be placed at the next
 * Allocate, or gives `"not_found"` when there's no such group. Nobody else moves.
 */
export async function deleteGroup(db: Db, id: string): Promise<"not_found" | null> {
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const [group] = await tx
      .select({ id: participantGroups.id })
      .from(participantGroups)
      .where(eq(participantGroups.id, id))
      .for("update");
    if (!group) return "not_found";
    await tx
      .update(groupMembers)
      .set({ groupId: null, placedAt: null, how: null })
      .where(eq(groupMembers.groupId, id));
    await tx.delete(participantGroups).where(eq(participantGroups.id, id));
    return null;
  });
}

/**
 * Joins the user. Before allocation has started, they wait. After it has, they
 * are a latecomer, placed at once by the spec's "Placement rules" without the
 * shuffle, or left waiting when there's no group. Someone who has already
 * joined keeps their place. The allocation lock makes many joins at once take
 * turns, so each sees the sizes the one before left.
 */
export async function joinGroups(
  db: Db,
  userId: string,
  now: Date,
  organizers: Organizers,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { startedAt } = await lockAllocation(tx);
    const [already] = await tx
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId))
      .for("update");
    if (already) return;

    const joinedAt = now.toISOString();
    const place =
      startedAt === null
        ? undefined
        : choosePlace((await loadPlacesAndMembers(tx, organizers)).places);
    await tx
      .insert(groupMembers)
      .values(
        place
          ? { userId, joinedAt, groupId: place.id, placedAt: joinedAt, how: "latecomer" }
          : { userId, joinedAt },
      );
  });
}

/**
 * An organizer's choice of where `userId` goes: the group `groupId`, or waiting when it's null.
 * It may pass a capacity, since an organizer's judgement overrules it (the spec's "Placement
 * rules"). Someone who hasn't joined joins now. Putting someone where they already are changes
 * nothing. It gives `"not_found"` when there's no such user or group, and `"organizer"` for an
 * account on the organizer list, which is never placed (the spec's user story 52).
 */
export async function placeMember(
  db: Db,
  userId: string,
  groupId: string | null,
  now: Date,
  organizers: Organizers,
): Promise<"not_found" | "organizer" | null> {
  if (organizers.has(userId)) return "organizer";
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) return "not_found";
    if (groupId !== null) {
      const [group] = await tx
        .select({ id: participantGroups.id })
        .from(participantGroups)
        .where(eq(participantGroups.id, groupId))
        .for("update");
      if (!group) return "not_found";
    }
    const [member] = await tx
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId))
      .for("update");
    if (member && member.groupId === groupId) return null;

    const at = now.toISOString();
    const place =
      groupId === null
        ? { groupId: null, placedAt: null, how: null }
        : { groupId, placedAt: at, how: "organizer" as const };
    if (member) {
      await tx.update(groupMembers).set(place).where(eq(groupMembers.userId, userId));
    } else {
      await tx.insert(groupMembers).values({ userId, joinedAt: at, ...place });
    }
    return null;
  });
}

/**
 * Takes `userId` off the board, as someone who has left, so they no longer count toward a
 * group's size. They can join again, as a latecomer once allocation has started. It gives
 * `"not_found"` when they haven't joined.
 */
export async function removeMember(db: Db, userId: string): Promise<"not_found" | null> {
  return db.transaction(async (tx) => {
    await lockAllocation(tx);
    const [member] = await tx
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId))
      .for("update");
    if (!member) return "not_found";
    await tx.delete(groupMembers).where(eq(groupMembers.userId, userId));
    return null;
  });
}

/**
 * Readies the groups for another timed trial (the spec's user story 37): everyone leaves their
 * group and the waiting list, so each has to join again, and allocation goes back to not
 * started. The groups stay as they are.
 */
export async function resetAllocation(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAllocation(tx);
    await tx.delete(groupMembers);
    await tx
      .update(groupAllocation)
      .set({ startedAt: null })
      .where(eq(groupAllocation.id, ALLOCATION_ROW));
  });
}

/** Puts the waiting list in the order Allocate places it. */
export type Shuffle = <T>(items: T[]) => T[];

/** The fewest joined participants Allocate takes for each group, so nobody is put in one alone. */
export const MIN_PER_GROUP = 2;

/** Why Allocate placed nobody, as its 409 answers (draft for the API agreement's 0.14). */
export type AllocateRefusal =
  | { error: "no_groups" }
  | { error: "too_few_participants"; needed: number };

/**
 * Places everyone waiting by the spec's "Placement rules", in an order
 * `shuffle` gives, each as choosePlace() says, and moves nobody already
 * placed. The first time, it also starts allocation, and from then on
 * joinGroups() places each latecomer as they join.
 *
 * It refuses, placing nobody and starting nothing, when there are no groups,
 * or fewer than 2 joined participants for each group.
 */
export async function allocateWaiting(
  db: Db,
  now: Date,
  shuffle: Shuffle,
  organizers: Organizers,
): Promise<AllocateRefusal | null> {
  return db.transaction(async (tx) => {
    const { startedAt } = await lockAllocation(tx);
    return placeWaiting(tx, startedAt, now, shuffle, organizers);
  });
}

/**
 * allocateWaiting()'s work, inside a transaction that already holds the allocation lock and
 * knows when allocation `startedAt`.
 */
async function placeWaiting(
  tx: Tx,
  startedAt: string | null,
  now: Date,
  shuffle: Shuffle,
  organizers: Organizers,
): Promise<AllocateRefusal | null> {
  const { places, members } = await loadPlacesAndMembers(tx, organizers);
  if (places.length === 0) return { error: "no_groups" };
  const refusal = tooFew(places.length, members.length);
  if (refusal) return refusal;

  const newcomers = new Map(places.map(({ id }) => [id, [] as string[]]));
  const waiting = members.filter((member) => member.groupId === null);
  for (const { userId } of shuffle(waiting)) {
    const place = choosePlace(places)!;
    place.size += 1;
    newcomers.get(place.id)!.push(userId);
  }

  const placedAt = now.toISOString();
  for (const [id, userIds] of newcomers) {
    if (userIds.length === 0) continue;
    await tx
      .update(groupMembers)
      .set({ groupId: id, placedAt, how: "allocated" })
      .where(inArray(groupMembers.userId, userIds));
  }
  if (startedAt === null) {
    await tx
      .update(groupAllocation)
      .set({ startedAt: placedAt })
      .where(eq(groupAllocation.id, ALLOCATION_ROW));
  }
  return null;
}

/** Allocate's refusal when `joined` is fewer than 2 for each of `groupCount` groups. */
function tooFew(groupCount: number, joined: number): AllocateRefusal | null {
  const needed = MIN_PER_GROUP * groupCount - joined;
  return needed > 0 ? { error: "too_few_participants", needed } : null;
}

/** What an organizer enters in the Groups screen's one-step form (BAC-138, BAC-141). */
export interface SplitFields {
  /** Each group's capacity, at least MIN_PER_GROUP. */
  peoplePerGroup: number;
  /** Group n's location is the nth, none past the end, and any past the last group is ignored. */
  locations: (string | null)[];
}

/** Why the one-step form made nothing: Allocate's refusal, or groups already there. */
export type SplitRefusal = AllocateRefusal | { error: "groups_exist" };

/**
 * How many groups a split makes of `joined` people (BAC-141). Rounding up puts nobody over the
 * number entered, and the cap stops anyone being alone when 2 is entered and an odd number has
 * joined. The screen's line works this out as well, in event-web's lib/group-fields.ts.
 */
function splitGroupCount(joined: number, peoplePerGroup: number): number {
  return Math.min(Math.ceil(joined / peoplePerGroup), Math.floor(joined / MIN_PER_GROUP));
}

/**
 * The Groups screen's shortcut (BAC-138, BAC-141): counts who has joined, makes as many groups
 * as splitGroupCount() says, named "Group 1", "Group 2" and so on, each with `peoplePerGroup` as
 * its capacity, then allocates everyone, as allocateWaiting() does. It all happens in one
 * transaction, so a refusal leaves nothing behind and the same form can be sent again.
 *
 * It refuses with `groups_exist` when any group is there, so it can't overwrite a live board,
 * and with Allocate's `too_few_participants` when fewer than 2 have joined, as for one group.
 * The allocation lock makes two at once take turns, so the second finds the first's groups.
 */
export async function splitIntoGroups(
  db: Db,
  fields: SplitFields,
  now: Date,
  shuffle: Shuffle,
  organizers: Organizers,
): Promise<SplitRefusal | null> {
  return db.transaction(async (tx) => {
    const { startedAt } = await lockAllocation(tx);
    const { places, members } = await loadPlacesAndMembers(tx, organizers);
    if (places.length > 0) return { error: "groups_exist" };
    const refusal = tooFew(1, members.length);
    if (refusal) return refusal;

    await tx.insert(participantGroups).values(
      Array.from({ length: splitGroupCount(members.length, fields.peoplePerGroup) }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Group ${i + 1}`,
        tags: [],
        location: fields.locations[i] ?? null,
        capacity: fields.peoplePerGroup,
        // A millisecond apart, so the board lists them in number order, oldest first.
        createdAt: new Date(now.getTime() + i).toISOString(),
      })),
    );
    return placeWaiting(tx, startedAt, now, shuffle, organizers);
  });
}

/** A group as allocation counts it, with how many are in it now. */
interface Place {
  id: string;
  capacity: number | null;
  size: number;
}

/**
 * Every group oldest first, with its size, and every participant who has joined. Call it
 * only with the allocation lock held. Its reads lock too, since on TiDB a plain
 * read after the lock could miss a join that the lock waited for.
 */
async function loadPlacesAndMembers(tx: Tx, organizers: Organizers) {
  const groups = await tx
    .select({ id: participantGroups.id, capacity: participantGroups.capacity })
    .from(participantGroups)
    .orderBy(asc(participantGroups.createdAt), asc(participantGroups.id))
    .for("update");
  const members = await tx
    .select({ userId: groupMembers.userId, groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(participantsOnly(organizers))
    .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId))
    .for("update");
  const places: Place[] = groups.map(({ id, capacity }) => ({
    id,
    capacity,
    size: members.filter((member) => member.groupId === id).length,
  }));
  return { places, members };
}

/**
 * Where the next person goes by the spec's "Placement rules": the group with
 * the fewest members that still has room, or, when every group is full, the
 * group with the fewest members. The first in `places`, the oldest, wins a tie.
 * None when there are no groups.
 */
function choosePlace(places: Place[]): Place | undefined {
  return smallest(places.filter(hasRoom)) ?? smallest(places);
}

/** Whether a group can take one more without passing its capacity. */
function hasRoom({ capacity, size }: Place): boolean {
  return capacity === null || size < capacity;
}

/** The group with the fewest members, the first in `places` on a tie, or none from an empty list. */
function smallest(places: Place[]): Place | undefined {
  return places.reduce<Place | undefined>(
    (best, place) => (best === undefined || place.size < best.size ? place : best),
    undefined,
  );
}

/** A copy of `items` in a random order (Fisher-Yates). */
export const shuffleAtRandom: Shuffle = (items) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
};

/**
 * Each user's group as it is now, by user ID, for the connections game (BAC-140). Someone
 * who hasn't joined, or is waiting, has none, and isn't in the map. A plain read, so in a
 * transaction it must come before any lock to see the groups as they were at its start.
 */
export async function groupsOf(db: Db | Tx, userIds: readonly string[]) {
  const rows = await db
    .select({ userId: groupMembers.userId, groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(inArray(groupMembers.userId, [...userIds]));
  return new Map(rows.flatMap(({ userId, groupId }) => (groupId ? [[userId, groupId]] : [])));
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
export async function loadGroupBoard(db: Db, organizers: Organizers) {
  const [startedAt, connectAcross, groups, members] = await Promise.all([
    allocationStartedAt(db),
    loadConnectAcross(db),
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
      .where(participantsOnly(organizers))
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId)),
  ]);
  return {
    startedAt,
    connectAcross,
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
 * with its members' names. Never anyone's user ID, nor anyone else's group. An
 * organizer reads `not_joined`.
 */
export async function loadMyGroup(db: Db, userId: string, organizers: Organizers) {
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
  if (!mine || organizers.has(userId))
    return { status: "not_joined" as const, allocationStarted, group: null };
  if (!mine.group) return { status: "waiting" as const, allocationStarted, group: null };
  const members = await db
    .select({ displayName: users.displayName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, mine.group.id), participantsOnly(organizers)))
    .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId));
  return { status: "placed" as const, allocationStarted, group: { ...mine.group, members } };
}
