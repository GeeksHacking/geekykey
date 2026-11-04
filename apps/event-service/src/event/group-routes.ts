import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { log } from "../lib/log.ts";
import { jsonBody } from "../lib/validate.ts";
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
  type Organizers,
  placeMember,
  removeMember,
  resetAllocation,
  type Shuffle,
  shuffleAtRandom,
} from "./groups.ts";
import { optionalOrganizerText, organizerText } from "./organizer-text.ts";
import {
  requireRole,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";

/** What a user's own group answers (draft for the API agreement's 0.14). */
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
    },
  };
}

/** A group as the organizers' board lists it (draft for the API agreement's 0.14). */
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
  };
}

/** The organizers' board (draft for the API agreement's 0.14). */
function groupBoardBody(board: Awaited<ReturnType<typeof loadGroupBoard>>) {
  return {
    allocation_started_at: board.startedAt,
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
  now = () => new Date(),
}: {
  session: SessionOptions;
  now?: () => Date;
}) {
  const app = new Hono<AppEnv & SessionEnv>();

  const { organizers } = session;

  app.get("/", requireSession(session), async (c) =>
    c.json(myGroupBody(await loadMyGroup(c.var.db, c.var.user.id, organizers))),
  );

  app.post("/", requireSession(session), requireRole("participant"), async (c) => {
    const { db, user } = c.var;
    await joinGroups(db, user.id, now(), organizers);
    return c.json(myGroupBody(await loadMyGroup(db, user.id, organizers)));
  });

  return app;
}

/** The most tags a group can have (the spec's draft for the API agreement's 0.14). */
const TAGS_MAX = 5;

/**
 * A group's fields: its name, up to 5 tags, where its members go, and the most people it has
 * room for, or none for any number (draft for the API agreement's 0.14). A missing field is
 * none, so a PUT sets them all.
 */
const groupFieldsSchema = z.object({
  name: organizerText("name"),
  tags: z.array(organizerText("tag")).max(TAGS_MAX).default([]),
  location: optionalOrganizerText("location"),
  capacity: z.number().int().positive().nullable().default(null),
});

/** Where an organizer puts someone: a group by its ID, or waiting with null. */
const placeMemberSchema = z.object({ group_id: z.string().nullable() });

/**
 * Mounted at /api/v1/admin/groups, inside adminRoutes(), which lets only
 * organizers through.
 */
export function adminGroupRoutes({
  organizers,
  now = () => new Date(),
  shuffle = shuffleAtRandom,
}: {
  /** From config.organizers: the accounts kept out of every group. */
  organizers: Organizers;
  now?: () => Date;
  /** At random unless a test gives its own. */
  shuffle?: Shuffle;
}) {
  const app = new Hono<AppEnv & SessionEnv>();

  app.get("/", async (c) => c.json(groupBoardBody(await loadGroupBoard(c.var.db, organizers))));

  app.post("/", jsonBody(groupFieldsSchema), async (c) => {
    const group = await createGroup(c.var.db, c.req.valid("json"), now());
    if (group === "name_taken") return c.json({ error: "name_taken" }, 409);
    log("group_created", { user_id: c.var.user.id, group_id: group.id });
    return c.json(eventGroupBody(group), 201);
  });

  app.put("/:id", jsonBody(groupFieldsSchema), async (c) => {
    const { db, user } = c.var;
    const id = c.req.param("id");
    const refusal = await editGroup(db, id, c.req.valid("json"));
    if (refusal === "not_found") return c.json({ error: "not_found" }, 404);
    if (refusal === "name_taken") return c.json({ error: "name_taken" }, 409);
    log("group_changed", { user_id: user.id, group_id: id });
    const group = (await loadGroupBoard(db, organizers)).groups.find((each) => each.id === id);
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
    return c.json(groupBoardBody(await loadGroupBoard(db, organizers)));
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
    return c.json(groupBoardBody(await loadGroupBoard(c.var.db, organizers)));
  });

  // Everyone joins again for the next trial, and the groups stay.
  app.post("/reset", async (c) => {
    await resetAllocation(c.var.db);
    log("groups_reset", { user_id: c.var.user.id });
    return c.json(groupBoardBody(await loadGroupBoard(c.var.db, organizers)));
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
