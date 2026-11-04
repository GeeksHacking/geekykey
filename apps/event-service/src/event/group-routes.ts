import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { log } from "../lib/log.ts";
import { jsonBody } from "../lib/validate.ts";
import { exportGroupsCsv } from "./export.ts";
import {
  allocateWaiting,
  createGroup,
  type EventGroup,
  joinGroups,
  loadGroupBoard,
  loadMyGroup,
  type Shuffle,
  shuffleAtRandom,
} from "./groups.ts";
import { organizerText } from "./organizer-text.ts";
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

  app.get("/", requireSession(session), async (c) =>
    c.json(myGroupBody(await loadMyGroup(c.var.db, c.var.user.id))),
  );

  app.post("/", requireSession(session), requireRole("participant"), async (c) => {
    const { db, user } = c.var;
    await joinGroups(db, user.id, now());
    return c.json(myGroupBody(await loadMyGroup(db, user.id)));
  });

  return app;
}

/**
 * A new group: its name, and the most people it has room for, or none for any number (draft
 * for the API agreement's 0.14).
 */
const createGroupSchema = z.object({
  name: organizerText("name"),
  capacity: z.number().int().positive().nullable().default(null),
});

/**
 * Mounted at /api/v1/admin/groups, inside adminRoutes(), which lets only
 * organizers through.
 */
export function adminGroupRoutes({
  now = () => new Date(),
  shuffle = shuffleAtRandom,
}: {
  now?: () => Date;
  /** At random unless a test gives its own. */
  shuffle?: Shuffle;
}) {
  const app = new Hono<AppEnv & SessionEnv>();

  app.get("/", async (c) => c.json(groupBoardBody(await loadGroupBoard(c.var.db))));

  app.post("/", jsonBody(createGroupSchema), async (c) => {
    const group = await createGroup(c.var.db, c.req.valid("json"), now());
    if (group === "name_taken") return c.json({ error: "name_taken" }, 409);
    log("group_created", { user_id: c.var.user.id, group_id: group.id });
    return c.json(eventGroupBody(group), 201);
  });

  app.post("/allocate", async (c) => {
    const refusal = await allocateWaiting(c.var.db, now(), shuffle);
    if (refusal) return c.json(refusal, 409);
    log("groups_allocated", { user_id: c.var.user.id });
    return c.json(groupBoardBody(await loadGroupBoard(c.var.db)));
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
