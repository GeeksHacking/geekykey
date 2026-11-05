import { eq } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { type CONNECT_ACROSS, eventSettings } from "./schema.ts";

/*
  The connection rule (the API agreement's section 4, "Connections", BAC-140):
  two people of different token kinds, as the token game has always had it,
  or two people placed in different groups, whatever their tokens' kinds.
  Organizers switch it on the Groups screen at any time, with no deploy. It's
  kept in the database, so every instance of the service reads the same one,
  and a restart keeps it. It's in the base, not the connections game's folder,
  because the Groups board reads it too.
*/

export type ConnectAcross = (typeof CONNECT_ACROSS)[number];

/** The one row of event_settings. */
const SETTINGS_ROW = 1;

/** What a new event connects across, before an organizer changes it. */
export const CONNECT_ACROSS_DEFAULT: ConnectAcross = "token_kinds";

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
