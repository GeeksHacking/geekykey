import { Hono } from "hono";
import { z } from "zod";
import { jsonBody, validationFailed } from "../lib/validate.ts";
import { answerSchema, type OwnQuestion, questionAndAnswer, setAnswer } from "./answers.ts";
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
  /** The questions in the event's answers game, from its settings, or none for no answers game. */
  questions: readonly string[];
}

/** PATCH /api/v1/me's body (the API agreement's 8.7): either field, or both. */
const setMeSchema = z
  .object({ display_name: displayNameSchema.optional(), answer: answerSchema.optional() })
  .refine(
    (body) => body.display_name !== undefined || body.answer !== undefined,
    "A request needs display_name, answer or both",
  );

/** The `user` object that GET and PATCH /api/v1/me answer with (the API agreement's 8.1). */
function userBody(user: SessionUser, { question, answer }: OwnQuestion) {
  return {
    id: user.id,
    display_name: user.displayName,
    role: user.role,
    has_name: user.hasName,
    kind: user.kind,
    question,
    answer,
  };
}

/**
 * Mounted at /api/v1/me, for a signed-in user of any role. A 401 is how the
 * frontend learns that nobody is signed in.
 *
 * GET / is everything the participant dashboard and passport need in one
 * call. PATCH / sets the name the event shows (display-names.ts), the
 * answer in the answers game (answers.ts), or both. Each gives the user
 * their question first if they have none yet.
 */
export function meRoutes({ session, questions }: MeRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();

  app.get("/", requireSession(session), async (c) => {
    // The session already loaded the profile, so only the rest is read here.
    const user = c.var.user;
    const [me, own] = await Promise.all([
      loadMe(c.var.db, user.id),
      questionAndAnswer(c.var.db, user, questions),
    ]);
    return c.json({
      user: userBody(user, own),
      points: me.points,
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
    });
  });

  app.patch("/", requireSession(session), jsonBody(setMeSchema), async (c) => {
    const { display_name, answer } = c.req.valid("json");
    const { db, user } = c.var;
    const own = await questionAndAnswer(db, user, questions);
    // Checked before anything is written, so a request where either field fails changes neither.
    if (answer !== undefined && own.question === null) {
      return validationFailed(c, ["answer"], "There is no question to answer");
    }
    await db.transaction(async (tx) => {
      if (display_name !== undefined) await setOwnName(tx, user.id, display_name);
      if (answer !== undefined) await setAnswer(tx, user.id, answer);
    });
    const named =
      display_name === undefined ? user : { ...user, displayName: display_name, hasName: true };
    return c.json({ user: userBody(named, answer === undefined ? own : { ...own, answer }) });
  });

  return app;
}
