import { Hono } from "hono";
import { z } from "zod";
import { jsonBody } from "../lib/validate.ts";
import { type Answers, type AnswersGame, answersSchema } from "./answers.ts";
import type { Connection, ConnectionsGame } from "./connections.ts";
import { displayNameSchema, setOwnName } from "./display-names.ts";
import {
  requireSession,
  type SessionEnv,
  type SessionOptions,
  type SessionUser,
} from "./session-auth.ts";
import { loadMe } from "./me.ts";
import type { AppEnv } from "../app.ts";

export interface MeRouteDeps {
  session: SessionOptions;
  /** The event's answers game, from its settings, or null for none. */
  answers: AnswersGame | null;
  /** The event's connections game, from its settings, or null for none. */
  connections: ConnectionsGame | null;
  /** The clock that says when what a pair share is shown. Tests pin it. */
  now?: () => Date;
}

/** One of the user's connections, as /me lists it (8.1). */
function connectionBody(connection: Connection) {
  return {
    connected_at: connection.connectedAt,
    kind: connection.kind,
    match: connection.match,
    shared: connection.shared,
    shared_at: connection.sharedAt,
  };
}

/** The `user` object that GET and PATCH /api/v1/me answer with (the API agreement's 8.1). */
function userBody(user: SessionUser, answers: Answers) {
  return {
    id: user.id,
    display_name: user.displayName,
    role: user.role,
    has_name: user.hasName,
    kind: user.kind,
    answers,
  };
}

/**
 * Mounted at /api/v1/me, for a signed-in user of any role. A 401 is how the
 * frontend learns that nobody is signed in.
 *
 * GET / is everything the participant dashboard and passport need in one
 * call. PATCH / sets the name the event shows (display-names.ts), some
 * answers in the event's answers game (answers.ts), or both.
 */
export function meRoutes({
  session,
  answers: game,
  connections: connectionsGame,
  now = () => new Date(),
}: MeRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();

  /** PATCH /api/v1/me's body: either field, or both. */
  const setMeSchema = z
    .object({
      display_name: displayNameSchema.optional(),
      answers: answersSchema(game).optional(),
    })
    .refine(
      (body) => body.display_name !== undefined || body.answers !== undefined,
      "A request needs display_name, answers or both",
    );

  app.get("/", requireSession(session), async (c) => {
    // The session already loaded the profile, so only the rest is read here.
    const user = c.var.user;
    const [me, answers, connections] = await Promise.all([
      loadMe(c.var.db, user.id),
      game ? game.answersOf(c.var.db, user.id) : {},
      connectionsGame ? connectionsGame.connectionsOf(c.var.db, user.id, now()) : [],
    ]);
    return c.json({
      user: userBody(user, answers),
      questions: game ? game.questions : null,
      // The passport's points, and the same for each connection, whatever its match.
      points: me.points + connections.length * (connectionsGame?.pointsEach ?? 0),
      // The wire calls the passport's slots `stamps`. Fields are never renamed within /api/v1.
      stamps: me.passport.map((slot) => ({
        station_id: slot.stationId,
        name: slot.name,
        location: slot.location,
        points: slot.points,
        link: slot.link,
        earned_at: slot.earnedAt,
      })),
      recent_taps: me.recentTaps.map((t) => ({
        id: t.id,
        station_id: t.stationId,
        station_name: t.stationName,
        status: t.status,
        source: t.source,
        tapped_at: t.tappedAt,
        received_at: t.receivedAt,
      })),
      next_stop:
        me.nextStop === null
          ? null
          : {
              station_id: me.nextStop.stationId,
              name: me.nextStop.name,
              booth: me.nextStop.booth,
            },
      connections: connections.map(connectionBody),
    });
  });

  app.patch("/", requireSession(session), jsonBody(setMeSchema), async (c) => {
    const { display_name, answers: given } = c.req.valid("json");
    const { db, user } = c.var;
    // One transaction, so a request whose answers are refused changes the name neither.
    const saved = await db.transaction(async (tx) => {
      // With no game, answersSchema() lets through only an empty `answers`, which sets nothing.
      const result = !game
        ? {}
        : given === undefined
          ? await game.answersOf(tx, user.id)
          : await game.setAnswers(tx, user.id, given);
      if (result !== "fixed" && display_name !== undefined) {
        await setOwnName(tx, user.id, display_name);
      }
      return result;
    });
    if (saved === "fixed") return c.json({ error: "answers_fixed" }, 409);
    const named =
      display_name === undefined ? user : { ...user, displayName: display_name, hasName: true };
    return c.json({ user: userBody(named, saved) });
  });

  return app;
}
