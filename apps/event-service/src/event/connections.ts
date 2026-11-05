import type { MeetingStatus } from "@geekykey/handoff";
import type { Db } from "../db/pool.ts";

/*
  What the base knows of the connections game (spec section 6, "The answers
  game"): the meeting hand-off hands it each half (the API agreement's
  11.10), /me lists each user's connections and counts their points (8.1),
  and the map draws the web (9.10). The game itself, with its records, lives
  in src/games/connections/, and src/app.ts hands it in, as it does the
  games. An event without it takes no meetings.
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

/** One of a user's connections, as /me lists it, with nothing that names the other person. */
export interface Connection {
  connectedAt: string;
  /** The other person's kind, or null for none, which only a connection across groups has. */
  kind: string | null;
  /**
   * The questions both answered the same, out of those both answered, as a
   * whole percent. Null when they have no answered question in common.
   */
  match: number | null;
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

export interface ConnectionsGame {
  /** What each connection adds to a user's points, the same whatever the match. */
  readonly pointsEach: number;
  /** Takes one half, at `now`, and gives the meeting hand-off's status. */
  meet(db: Db, meeting: Meeting, now: Date): Promise<MeetingStatus>;
  /** The user's connections, newest first, as they stand at `now`. */
  connectionsOf(db: Db, userId: string, now: Date): Promise<Connection[]>;
  /** Every connection, for the map. */
  web(db: Db): Promise<ConnectionsWeb>;
}
