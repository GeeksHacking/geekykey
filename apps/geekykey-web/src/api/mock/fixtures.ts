/*
  Seed data for the mock client, shaped like the GeekyKey Service (agreement 8.4).
  Deterministic so tests are stable, but anchored to "now" so timestamps look live.
  Uneven numbers on purpose, as apps/frontend/CLAUDE.md asks.

  There are no stations here. Agreement version 0.3 emptied section 10: each Event
  Service registers its own stations, so the registry lives in apps/frontend now.
*/

export interface MockEventService {
  id: string;
  name: string;
  /** The public address /me hands the token page for its links (agreement 8.4). */
  url: string;
  /** Present only while the service is in the settings; a station link can outlive it. */
  in_settings: boolean;
}

export interface MockToken {
  /** Normalised form: upper-case hex, no separators (agreement "Token UID"). */
  uid: string;
  /** null until somebody claims it. */
  owner_id: string | null;
  claimed_at: string | null;
}

export interface MockData {
  event_services: MockEventService[];
  tokens: MockToken[];
  /**
   * user IDs on the GeekyKey Service's admin list. Since 0.3 an admin's one
   * job is releasing someone else's token (8.3 with `owner_id`); the station jobs
   * moved to the Event screens.
   */
  admins: string[];
}

export const SEEDED_PARTICIPANT_ID = "dev-user-1";
export const SEEDED_ADMIN_ID = "dev-organizer-1";

/** The showcase, the one Event Service in the settings. */
const SHOWCASE_ID = "showcase";

const iso = (ms: number) => new Date(ms).toISOString();

export function createFixtures(now: number = Date.now()): MockData {
  const minutes = (n: number) => n * 60_000;
  const eventStart = now - minutes(137);

  const event_services: MockEventService[] = [
    {
      id: SHOWCASE_ID,
      name: "Capstone Showcase",
      url: "https://event.geekshacking.com",
      in_settings: true,
    },
    // Left the settings, so /me offers no link to it (agreement 8.4).
    {
      id: "e_4b19",
      name: "Midnight Hardware Jam",
      url: "https://event.geekshacking.com/jam",
      in_settings: false,
    },
  ];

  /*
    The seeded participant owns two tokens, which leaves room for the 3-token limit
    to be reached in one claim. Two belong to other people and one is unclaimed, so
    the token page has a case for every `owner` value.
  */
  const tokens: MockToken[] = [
    {
      uid: "04A1B2C3D4E5F6",
      owner_id: SEEDED_PARTICIPANT_ID,
      claimed_at: iso(eventStart - minutes(118)),
    },
    {
      uid: "04B7C9E1F3A5",
      owner_id: SEEDED_PARTICIPANT_ID,
      claimed_at: iso(eventStart - minutes(46)),
    },
    {
      uid: "04C3D5F70912",
      owner_id: "p_1041",
      claimed_at: iso(eventStart - minutes(92)),
    },
    {
      uid: "04D9E1F3A5B7",
      owner_id: "p_1066",
      claimed_at: iso(eventStart - minutes(21)),
    },
    { uid: "04E5F7091B3D", owner_id: null, claimed_at: null },
  ];

  return { event_services, tokens, admins: [SEEDED_ADMIN_ID] };
}
