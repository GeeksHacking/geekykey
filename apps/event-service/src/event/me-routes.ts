import { Hono } from "hono";
import { z } from "zod";
import { log } from "../lib/log.ts";
import { jsonBody } from "../lib/validate.ts";
import { type Answers, type AnswersGame, answersSchema } from "./answers.ts";
import type { Connection, ConnectionRequest, ConnectionsGame, Reaction } from "./connections.ts";
import { displayNameSchema, setOwnName } from "./display-names.ts";
import {
  requireSession,
  type SessionEnv,
  type SessionOptions,
  type SessionUser,
} from "./session-auth.ts";
import { participantIsReady } from "./participant-setup.ts";
import { loadMyPhrase, type MyPhrase } from "./phrase.ts";
import { loadMe } from "./me.ts";
import { bioSchema, contactLineSchema, setProfile } from "./profiles.ts";
import type { AppEnv } from "../app.ts";

import type { TeamDuelsGame } from "./team-duels.ts";

export interface MeRouteDeps {
  session: SessionOptions;
  /** The event's answers game, from its settings, or null for none. */
  answers: AnswersGame | null;
  /** The event's connections game, from its settings, or null for none. */
  connections: ConnectionsGame | null;
  teamDuels?: TeamDuelsGame | null;
  /** The clock that says when what a pair share is shown, and when one connects. Tests pin it. */
  now?: () => Date;
}

/**
 * A reaction test's play (8.11): the milliseconds from the signal to the tap, within the 2
 * minutes, or a tap before the signal.
 */
const reactionPlaySchema = z.union([
  z.strictObject({ ms: z.int().min(1).max(120_000) }),
  z.strictObject({ early: z.literal(true) }),
]);

/** Ends PATCH /api/v1/me's transaction, so a refused name undoes the answers saved before it. */
class NameTaken extends Error {}

/**
 * One of the user's connections, as /me lists it (8.1). With a phrase to see, it has the word
 * the connection gave, and whether they had it already, or null when the other person holds
 * none (BAC-169, agreement 0.14). With none, it has no `word` at all.
 */
function connectionBody(connection: Connection, phrase: MyPhrase | null) {
  const word = phrase?.byConnection.get(connection.id);
  return {
    ...(phrase && {
      word: word ? { text: word.text, already_had: word.alreadyHad } : null,
    }),
    id: connection.id,
    connected_at: connection.connectedAt,
    display_name: connection.displayName,
    bio: connection.bio,
    contact_line: connection.contactLine,
    kind: connection.kind,
    match: connection.match,
    dice:
      connection.dice === null
        ? null
        : {
            your_roll: connection.dice.yourRoll,
            their_roll: connection.dice.theirRoll,
            result: connection.dice.result,
          },
    reaction: connection.reaction === null ? null : reactionBody(connection.reaction),
    shared: connection.shared,
    shared_at: connection.sharedAt,
  };
}

/** A connection's reaction test from the user's side, as /me and a play give it (8.1, 8.11). */
function reactionBody(reaction: Reaction) {
  return {
    play_by: reaction.playBy,
    your_play: reaction.yourPlay,
    your_ms: reaction.yourMs,
    their_play: reaction.theirPlay,
    their_ms: reaction.theirMs,
    result: reaction.result,
  };
}

/** A request waiting for the user, as /me lists it (8.1). */
function connectionRequestBody(request: ConnectionRequest) {
  return {
    id: request.id,
    display_name: request.displayName,
    bio: request.bio,
    requested_at: request.requestedAt,
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
    bio: user.bio,
    contact_line: user.contactLine,
  };
}

/**
 * Mounted at /api/v1/me, for a signed-in user of any role. A 401 is how the
 * frontend learns that nobody is signed in.
 *
 * GET / is everything the participant dashboard and passport need in one
 * call. PATCH / sets any of the name the event shows (display-names.ts), some
 * answers in the event's answers game (answers.ts), the bio and the contact
 * line (profiles.ts).
 */
export function meRoutes({
  session,
  answers: game,
  connections: connectionsGame,
  teamDuels,
  now = () => new Date(),
}: MeRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();

  /** PATCH /api/v1/me's body: any of its fields. */
  const setMeSchema = z
    .object({
      display_name: displayNameSchema.optional(),
      answers: answersSchema(game).optional(),
      bio: bioSchema.optional(),
      contact_line: contactLineSchema.optional(),
    })
    .refine(
      (body) => Object.values(body).some((field) => field !== undefined),
      "A request needs at least one of display_name, answers, bio and contact_line",
    );

  app.get("/", requireSession(session), async (c) => {
    // The session already loaded the profile, so only the rest is read here.
    const user = c.var.user;
    const [me, answers, connections, requests] = await Promise.all([
      loadMe(c.var.db, user.id),
      game ? game.answersOf(c.var.db, user.id) : {},
      connectionsGame ? connectionsGame.connectionsOf(c.var.db, user.id, now()) : [],
      connectionsGame ? connectionsGame.requestsFor(c.var.db, user.id) : [],
    ]);
    const rounds = teamDuels
      ? await teamDuels.roundsOf(c.var.db, user.id, now())
      : { round: null, round_wins: 0 };
    const phrase = await loadMyPhrase(c.var.db, user.id, session.organizers, connections);
    return c.json({
      round_wins: rounds.round_wins,
      round:
        rounds.round === null
          ? null
          : {
              ...rounds.round,
              duels: rounds.round.duels.map((duel) => ({
                ...duel,
                reaction: duel.reaction === null ? null : reactionBody(duel.reaction),
              })),
            },
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
      connection_requests: requests.map(connectionRequestBody),
      connections: connections.map((connection) => connectionBody(connection, phrase)),
      // Only for a participant in a group while a phrase is set (BAC-169, agreement 0.14).
      // Anyone else's answer is as it was before the phrase.
      ...(phrase && { phrase: { words: phrase.words, your_word: phrase.yourWord } }),
    });
  });

  app.patch("/", requireSession(session), jsonBody(setMeSchema), async (c) => {
    const { display_name, answers: given, bio, contact_line: contactLine } = c.req.valid("json");
    const { db, user } = c.var;
    // One transaction, so a request whose answers or name is refused changes nothing else. The
    // answers come first: a name locks every user's row, and holding those while waiting for a
    // user's answers could deadlock against a request of theirs that saves answers and a bio.
    const saved = await db
      .transaction(async (tx) => {
        // With no game, answersSchema() lets through only an empty `answers`, which sets nothing.
        const result = !game
          ? {}
          : given === undefined
            ? await game.answersOf(tx, user.id)
            : await game.setAnswers(tx, user.id, given);
        if (result !== "fixed") {
          if (display_name !== undefined) {
            const refusal = await setOwnName(tx, user.id, display_name);
            if (refusal !== null) throw new NameTaken();
          }
          await setProfile(tx, user.id, { bio, contactLine });
        }
        return result;
      })
      .catch((err: unknown) => {
        if (err instanceof NameTaken) return "name_taken" as const;
        throw err;
      });
    if (saved === "name_taken") return c.json({ error: "name_taken" }, 409);
    if (saved === "fixed") return c.json({ error: "answers_fixed" }, 409);
    const updated = {
      ...user,
      ...(display_name !== undefined && { displayName: display_name, hasName: true }),
      ...(bio !== undefined && { bio }),
      ...(contactLine !== undefined && { contactLine }),
    };
    return c.json({ user: userBody(updated, saved) });
  });

  // Agreement 8.10, agreement 0.14. An event with no connections game has no
  // requests, so every ID is one that doesn't wait for this user.
  app.post("/connection-requests/:id/accept", requireSession(session), async (c) => {
    const { db, user } = c.var;
    const answer = { requestId: c.req.param("id"), userId: user.id };
    const result = connectionsGame
      ? await connectionsGame.accept(
          db,
          answer,
          now(),
          async (tx, id) => session.organizers.has(id) || (await participantIsReady(tx, id, game)),
        )
      : { status: "not_found" as const };
    if (result.status === "not_found") return c.json({ error: "not_found" }, 404);
    log("connection_request_accepted", {
      user_id: user.id,
      from_id: result.fromId,
      status: result.status,
    });
    return c.json({ status: result.status });
  });

  // Agreement 8.11, agreement 0.14 (BAC-156). The phone measures the time, so it could be
  // faked, which is acceptable for a game with a cosmetic prize.
  app.post(
    "/connections/:id/reaction",
    requireSession(session),
    jsonBody(reactionPlaySchema),
    async (c) => {
      const { db, user } = c.var;
      const body = c.req.valid("json");
      const play = {
        connectionId: c.req.param("id"),
        userId: user.id,
        ms: "ms" in body ? body.ms : null,
      };
      const result = connectionsGame
        ? await connectionsGame.playReaction(db, play, now())
        : { status: "not_found" as const };
      if (result.status === "not_found") return c.json({ error: "not_found" }, 404);
      if (result.status !== "played") return c.json({ error: result.status }, 409);
      log("reaction_played", { user_id: user.id, ms: play.ms });
      return c.json({ reaction: reactionBody(result.reaction) });
    },
  );

  // BAC-155, the same play and errors as agreement 8.11, without a connection.
  app.post(
    "/duels/:id/reaction",
    requireSession(session),
    jsonBody(reactionPlaySchema),
    async (c) => {
      const body = c.req.valid("json");
      const result = teamDuels
        ? await teamDuels.playReaction(
            c.var.db,
            { duelId: c.req.param("id"), userId: c.var.user.id, ms: "ms" in body ? body.ms : null },
            now(),
          )
        : { status: "not_found" as const };
      if (result.status === "not_found") return c.json({ error: "not_found" }, 404);
      if (result.status !== "played") return c.json({ error: result.status }, 409);
      return c.json({ reaction: reactionBody(result.reaction) });
    },
  );

  app.post("/connection-requests/:id/decline", requireSession(session), async (c) => {
    const { db, user } = c.var;
    const answer = { requestId: c.req.param("id"), userId: user.id };
    const declined = connectionsGame ? await connectionsGame.decline(db, answer) : false;
    if (!declined) return c.json({ error: "not_found" }, 404);
    log("connection_request_declined", { user_id: user.id });
    return c.body(null, 204);
  });

  return app;
}
