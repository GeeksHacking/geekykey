import { eq } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { type CHALLENGES, type CONNECT_ACROSS, eventSettings } from "./schema.ts";

/*
  The event's settings that organizers change on the Groups screen at any time,
  with no deploy:

  - The connection rule (the API agreement's section 4, "Connections", BAC-140):
    two people of different token kinds, as the token game has always had it,
    or two people placed in different groups, whatever their tokens' kinds.
  - The challenge a new connection plays (BAC-161): one of the dice and the
    reaction test at random, as it always has, or always one of them.

  They're kept in the database, so every instance of the service reads the
  same ones, and a restart keeps them. They're in the base, not the connections
  game's folder, because the Groups board reads them too.
*/

export type ConnectAcross = (typeof CONNECT_ACROSS)[number];

export type Challenge = (typeof CHALLENGES)[number];

/** The one row of event_settings. */
const SETTINGS_ROW = 1;

/** What a new event connects across, before an organizer changes it. */
export const CONNECT_ACROSS_DEFAULT: ConnectAcross = "token_kinds";

/** What a new event's connections play, before an organizer changes it. */
export const CHALLENGE_DEFAULT: Challenge = "random";

/** What the event connects across now. */
export async function loadConnectAcross(db: Db | Tx): Promise<ConnectAcross> {
  const [row] = await db
    .select({ connectAcross: eventSettings.connectAcross })
    .from(eventSettings)
    .where(eq(eventSettings.id, SETTINGS_ROW));
  return row?.connectAcross ?? CONNECT_ACROSS_DEFAULT;
}

/** Sets what the event connects across, from the next tap on. Connections already made stay. */
export async function setConnectAcross(db: Db, connectAcross: ConnectAcross): Promise<void> {
  await db
    .insert(eventSettings)
    .values({ id: SETTINGS_ROW, connectAcross })
    .onDuplicateKeyUpdate({ set: { connectAcross } });
}

/** What a new connection plays now. */
export async function loadChallenge(db: Db | Tx): Promise<Challenge> {
  const [row] = await db
    .select({ challenge: eventSettings.challenge })
    .from(eventSettings)
    .where(eq(eventSettings.id, SETTINGS_ROW));
  return row?.challenge ?? CHALLENGE_DEFAULT;
}

/**
 * Sets what a new connection plays, from the next connection on. Connections already
 * made keep their challenge, with its rolls or reaction times.
 */
export async function setChallenge(db: Db, challenge: Challenge): Promise<void> {
  await db
    .insert(eventSettings)
    .values({ id: SETTINGS_ROW, connectAcross: CONNECT_ACROSS_DEFAULT, challenge })
    .onDuplicateKeyUpdate({ set: { challenge } });
}
