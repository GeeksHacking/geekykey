import type { MeetingStatus } from "@geekykey/handoff";
import type { Tx } from "./games.ts";
import type { Db } from "../db/pool.ts";

/*
  What the base knows of the connections game (spec section 6, "The answers
  game"): the meeting hand-off hands it each half (the API agreement's 11.10),
  /me lists each user's connection requests and connections and counts their
  points (8.1), and the map draws the web (9.10). The game itself, with its
  records, lives in src/games/connections/, and src/app.ts hands it in, as it
  does the games. An event without it takes no meetings.
*/

/** One half of a connection: `userId` tapped their phone on a token of `ownerId`'s. */
export interface Meeting {
  userId: string;
  /** The kind of the tapper's first-claimed token, or null for none. */
  userKind: string | null;
  ownerId: string;
  /** The kind of the token tapped, or null for none. */
  ownerKind: string | null;
}

/** A request waiting for this user to accept or decline it, as /me lists it (the API agreement's 8.1). */
export interface ConnectionRequest {
  /** The request's own ID, since /me gives no other person's user ID. */
  id: string;
  /** The current name of the person asking, or `Guest` when they have none. */
  displayName: string;
  /** Their current bio, or null for none. It never comes with their contact line (8.1). */
  bio: string | null;
  requestedAt: string;
}

/** A user answering a request that waits for them (the API agreement's 8.10). */
export interface RequestAnswer {
  requestId: string;
  /** The person the request waits for. Nobody else can answer it. */
  userId: string;
}

/** What accepting a request answers (8.10): a meeting's status, since `waiting` has passed. */
export type AcceptStatus = Exclude<MeetingStatus, "waiting">;

/** What accepting a request gives. `fromId` is who sent it, for the log. */
export type AcceptResult = { status: "not_found" } | { status: AcceptStatus; fromId: string };

/**
 * Where one person stands in a connection's reaction test (the API agreement's 8.1, BAC-156):
 * `played` with a time, `early` for a tap before the signal, `missed` once the 2 minutes passed
 * with no play, and `not_played` until then.
 */
export type ReactionPlay = "not_played" | "played" | "early" | "missed";

/** A connection's reaction test from one user's side (8.1). */
export interface Reaction {
  /** When the 2 minutes to play end. */
  playBy: string;
  yourPlay: ReactionPlay;
  yourMs: number | null;
  /** Until `result` comes, an early tap shows as `played`, with no time, so nobody learns what to beat. */
  theirPlay: ReactionPlay;
  theirMs: number | null;
  /** Null until both have played or the 2 minutes have passed. */
  result: "win" | "loss" | null;
}

/** A user's play in a connection's reaction test (8.11). `ms` is null for a tap before the signal. */
export interface ReactionPlayRequest {
  connectionId: string;
  userId: string;
  ms: number | null;
}

/** What a play gives (8.11). */
export type ReactionPlayResult =
  | { status: "not_found" | "already_played" | "too_late" }
  | { status: "played"; reaction: Reaction };

/** One of a user's connections, as /me lists it, with no user ID and no answers of the other person's. */
export interface Connection {
  /** The connection's own ID, the same for both people, for a play (8.11). */
  id: string;
  connectedAt: string;
  /**
   * The other person's current name, so unlike the rest it can change after the connection.
   * Null when they have never logged in to this Event Service.
   */
  displayName: string | null;
  /** The other person's current bio, or null for none. It can change as the name can. */
  bio: string | null;
  /**
   * The other person's current contact line, or null for none. It can change as the name can.
   * This is the only answer that gives anyone else's (the API agreement's 8.1).
   */
  contactLine: string | null;
  /** The other person's kind, or null for none, which only a connection across groups has. */
  kind: string | null;
  /**
   * The questions both answered the same, out of those both answered, as a
   * whole percent. Null when they have no answered question in common.
   */
  match: number | null;
  /** The stored dice from this user's side, or null for a connection before dice (8.1). */
  dice: { yourRoll: number; theirRoll: number; result: "win" | "loss" } | null;
  /** The reaction test from this user's side, or null when the pair got dice or connected before it. */
  reaction: Reaction | null;
  /** The IDs of the questions both answered the same, or null until `sharedAt`. */
  shared: string[] | null;
  /** When `shared` is given: a while after the connection, so the pair talk first. */
  sharedAt: string;
}

/** The anonymous web the map draws. */
export interface ConnectionsWeb {
  count: number;
  /**
   * Each connection, oldest first, as the numbers of its two users, the
   * smaller first. Users are numbered from 1 in the order they first
   * connected.
   */
  links: [number, number][];
}

/** The base checks event names, answers and organizer roles; the game decides when to check. */
export type ReadyToConnect = (db: Db | Tx, userId: string) => Promise<boolean>;

export interface ConnectionsGame {
  /** What each connection adds to a user's points, the same whatever the match. */
  readonly pointsEach: number;
  /** Takes one half, at `now`, and gives the meeting hand-off's status. */
  meet(db: Db, meeting: Meeting, now: Date, isReady: ReadyToConnect): Promise<MeetingStatus>;
  /** The requests waiting for the user, newest first. */
  requestsFor(db: Db, userId: string): Promise<ConnectionRequest[]>;
  /**
   * Accepts a request at `now`. The rule runs again; a kind/group refusal takes the request,
   * while unfinished setup keeps it for a retry. It gives
   * `not_found` when no such request waits for the user.
   */
  accept(db: Db, answer: RequestAnswer, now: Date, isReady: ReadyToConnect): Promise<AcceptResult>;
  /** Declines a request, and gives false when no such request waits for the user. */
  decline(db: Db, answer: RequestAnswer): Promise<boolean>;
  /**
   * Keeps the user's one play in a connection's reaction test, at `now`. `not_found` when the
   * connection isn't theirs or has no reaction test.
   */
  playReaction(db: Db, play: ReactionPlayRequest, now: Date): Promise<ReactionPlayResult>;
  /** The user's connections, newest first, as they stand at `now`. */
  connectionsOf(db: Db, userId: string, now: Date): Promise<Connection[]>;
  /** Every connection, for the map. */
  web(db: Db): Promise<ConnectionsWeb>;
}
