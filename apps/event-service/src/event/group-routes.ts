import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { Db } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { jsonBody } from "../lib/validate.ts";
import type { ConnectionsGame } from "./connections.ts";
import { exportGroupsCsv } from "./export.ts";
import {
  allocateWaiting,
  createGroup,
  deleteGroup,
  editGroup,
  type EventGroup,
  joinGroups,
  loadGroupBoard,
  loadMyGroup,
  MIN_PER_GROUP,
  type Organizers,
  placeMember,
  removeMember,
  resetAllocation,
  setPhrase,
  type Shuffle,
  shuffleAtRandom,
  splitIntoGroups,
} from "./groups.ts";
import { optionalOrganizerText, organizerText } from "./organizer-text.ts";
import { phraseSchema } from "./phrase.ts";
import {
  requireRole,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";

/** What a user's own group answers (agreement 0.14). */
function myGroupBody({
  status,
  allocationStarted,
  group,
}: Awaited<ReturnType<typeof loadMyGroup>>) {
  return {
    status,
    allocation_started: allocationStarted,
    group: group && {
      id: group.id,
      name: group.name,
      tags: group.tags,
      location: group.location,
      members: group.members.map((member) => ({ display_name: member.displayName })),
      // Names only, never members (BAC-167, agreement 0.14).
      other_groups: group.otherGroups,
    },
  };
}

/** A group as the organizers' board lists it (agreement 0.14). */
function eventGroupBody(group: EventGroup) {
  return {
    id: group.id,
    name: group.name,
    tags: group.tags,
    location: group.location,
    capacity: group.capacity,
    members: group.members.map((member) => ({
      user_id: member.userId,
      display_name: member.displayName,
      joined_at: member.joinedAt,
      placed_at: member.placedAt,
      how: member.how,
    })),
    // The other groups it has reached, in the board's order (BAC-167, agreement 0.14).
    reached_group_ids: group.reachedGroupIds,
  };
}

/** The organizers' board (agreement 0.14). */
function groupBoardBody(board: Awaited<ReturnType<typeof loadGroupBoard>>) {
  return {
    allocation_started_at: board.startedAt,
    // The Groups screen's switch (BAC-140, agreement 0.14).
    connect_across: board.connectAcross,
    // The Groups screen's choice of challenge (BAC-161, agreement 0.14).
    challenge: board.challenge,
    // The phrase and how many have completed it, or null for none (BAC-169, agreement 0.14).
    phrase: board.phrase && {
      text: board.phrase.text,
      completed_count: board.phrase.completedCount,
    },
    joined_count: board.joinedCount,
    groups: board.groups.map(eventGroupBody),
    waiting: board.waiting.map((member) => ({
      user_id: member.userId,
      display_name: member.displayName,
      joined_at: member.joinedAt,
    })),
  };
}

/**
 * Mounted at /api/v1/me/group, for a signed-in user. Anyone can read it, and an
 * organizer, who is kept out of allocation, reads `not_joined`.
 */
export function myGroupRoutes({
  session,
  connections,
  now = () => new Date(),
}: {
  session: SessionOptions;
  /** The event's connections game, for the groups a group has reached, or null for none. */
  connections: ConnectionsGame | null;
  now?: () => Date;
}) {
  const app = new Hono<AppEnv & SessionEnv>();

  const { organizers } = session;

  app.get("/", requireSession(session), async (c) =>
    c.json(myGroupBody(await loadMyGroup(c.var.db, c.var.user.id, organizers, connections))),
  );

  app.post("/", requireSession(session), requireRole("participant"), async (c) => {
    const { db, user } = c.var;
    await joinGroups(db, user.id, now(), organizers);
    return c.json(myGroupBody(await loadMyGroup(db, user.id, organizers, connections)));
  });

  return app;
}

/** The most tags a group can have (the spec's agreement 0.14). */
const TAGS_MAX = 5;

/**
 * A group's fields: its name, up to 5 tags, where its members go, and the most people it has
 * room for, or none for any number (agreement 0.14). A missing field is
 * none, so a PUT sets them all.
 */
const groupFieldsSchema = z.object({
  name: organizerText("name"),
  tags: z.array(organizerText("tag")).max(TAGS_MAX).default([]),
  location: optionalOrganizerText("location"),
  capacity: z.number().int().positive().nullable().default(null),
});

/**
 * The Groups screen's one-step form (BAC-138, BAC-141, BAC-146, agreement 0.14):
 * exactly one of the people per group, which is each group's capacity and from which the
 * service works out how many groups, and the number of groups, which have no capacity. Then a
 * location for each group, in order. Locations follow a group's location rule, a missing one is
 * none, and any past the last group are ignored.
 */
const splitSchema = z
  .object({
    people_per_group: z
      .number()
      .int()
      .min(MIN_PER_GROUP, `people_per_group must be ${MIN_PER_GROUP} or more`)
      .optional(),
    group_count: z.number().int().min(1, "group_count must be 1 or more").optional(),
    locations: z.array(optionalOrganizerText("location")).default([]),
  })
  .refine(
    ({ people_per_group, group_count }) =>
      (people_per_group === undefined) !== (group_count === undefined),
    { message: "send exactly one of people_per_group and group_count" },
  );

/**
 * The Groups screen's phrase (BAC-169, agreement 0.14): 2 to 12 words
 * of at most 20 characters each, or null or blank text for none.
 */
const setPhraseSchema = z.object({ phrase: phraseSchema });

/** Where an organizer puts someone: a group by its ID, or waiting with null. */
const placeMemberSchema = z.object({ group_id: z.string().nullable() });

/**
 * Mounted at /api/v1/admin/groups, inside adminRoutes(), which lets only
 * organizers through.
 */
export function adminGroupRoutes({
  organizers,
  connections,
  now = () => new Date(),
  shuffle = shuffleAtRandom,
}: {
  /** From config.organizers: the accounts kept out of every group. */
  organizers: Organizers;
  /** The event's connections game, for the groups each group has reached, or null for none. */
  connections: ConnectionsGame | null;
  now?: () => Date;
  /** At random unless a test gives its own. */
  shuffle?: Shuffle;
}) {
  const app = new Hono<AppEnv & SessionEnv>();

  /** The board as it is now, which every route that changes it answers with. */
  const loadBoard = (db: Db) => loadGroupBoard(db, organizers, connections);

  app.get("/", async (c) => c.json(groupBoardBody(await loadBoard(c.var.db))));

  app.post("/", jsonBody(groupFieldsSchema), async (c) => {
    const group = await createGroup(c.var.db, c.req.valid("json"), now());
    if (group === "name_taken") return c.json({ error: "name_taken" }, 409);
    log("group_created", { user_id: c.var.user.id, group_id: group.id });
    return c.json(eventGroupBody(group), 201);
  });

  // Before /:id, which would take "phrase" for a group's ID.
  app.put("/phrase", jsonBody(setPhraseSchema), async (c) => {
    const { db, user } = c.var;
    const words = c.req.valid("json").phrase;
    await setPhrase(db, words, organizers);
    // The word count, not the words, which participants are there to find out.
    log("phrase_changed", { user_id: user.id, word_count: words?.length ?? 0 });
    return c.json(groupBoardBody(await loadBoard(db)));
  });

  app.put("/:id", jsonBody(groupFieldsSchema), async (c) => {
    const { db, user } = c.var;
    const id = c.req.param("id");
    const refusal = await editGroup(db, id, c.req.valid("json"));
    if (refusal === "not_found") return c.json({ error: "not_found" }, 404);
    if (refusal === "name_taken") return c.json({ error: "name_taken" }, 409);
    log("group_changed", { user_id: user.id, group_id: id });
    const group = (await loadBoard(db)).groups.find((each) => each.id === id);
    // Deleted between the edit and this read, as another organizer may.
    if (!group) return c.json({ error: "not_found" }, 404);
    return c.json(eventGroupBody(group));
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if ((await deleteGroup(c.var.db, id)) === "not_found") {
      return c.json({ error: "not_found" }, 404);
    }
    log("group_deleted", { user_id: c.var.user.id, group_id: id });
    return c.body(null, 204);
  });

  app.put("/members/:userId", jsonBody(placeMemberSchema), async (c) => {
    const { db, user } = c.var;
    const userId = c.req.param("userId");
    const groupId = c.req.valid("json").group_id;
    const refusal = await placeMember(db, userId, groupId, now(), organizers);
    if (refusal === "not_found") return c.json({ error: "not_found" }, 404);
    if (refusal === "organizer") return c.json({ error: "forbidden" }, 403);
    log("group_member_moved", { user_id: user.id, member_id: userId, group_id: groupId });
    return c.json(groupBoardBody(await loadBoard(db)));
  });

  app.delete("/members/:userId", async (c) => {
    const userId = c.req.param("userId");
    if ((await removeMember(c.var.db, userId)) === "not_found") {
      return c.json({ error: "not_found" }, 404);
    }
    log("group_member_removed", { user_id: c.var.user.id, member_id: userId });
    return c.body(null, 204);
  });

  app.post("/allocate", async (c) => {
    const refusal = await allocateWaiting(c.var.db, now(), shuffle, organizers);
    if (refusal) return c.json(refusal, 409);
    log("groups_allocated", { user_id: c.var.user.id });
    return c.json(groupBoardBody(await loadBoard(c.var.db)));
  });

  // Makes the groups and allocates everyone who has joined, in one step, or makes nothing.
  app.post("/split", jsonBody(splitSchema), async (c) => {
    const { people_per_group, group_count, locations } = c.req.valid("json");
    const refusal = await splitIntoGroups(
      c.var.db,
      {
        by:
          group_count === undefined
            ? { peoplePerGroup: people_per_group! }
            : { groupCount: group_count },
        locations,
      },
      now(),
      shuffle,
      organizers,
    );
    if (refusal) return c.json(refusal, 409);
    const board = await loadBoard(c.var.db);
    log("groups_split", { user_id: c.var.user.id, group_count: board.groups.length });
    return c.json(groupBoardBody(board), 201);
  });

  // Everyone joins again for the next trial, and the groups stay.
  app.post("/reset", async (c) => {
    await resetAllocation(c.var.db);
    log("groups_reset", { user_id: c.var.user.id });
    return c.json(groupBoardBody(await loadBoard(c.var.db)));
  });

  // Each person's group, times and how they were placed, as a file for the report.
  app.get("/export.csv", async (c) =>
    c.body(await exportGroupsCsv(c.var.db), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="geekykey-groups.csv"',
    }),
  );

  return app;
}
