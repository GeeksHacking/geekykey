/*
  Seed data for the mock client, shaped like the GeekyKey Service (agreement 8.4
  and 10). Deterministic so tests are stable, but anchored to "now" so timestamps
  look live. Uneven numbers on purpose, as apps/frontend/CLAUDE.md asks.
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

export interface MockStation {
  id: string;
  label: string;
  created_at: string;
  link: { event_service_id: string; linked_at: string } | null;
  disabled_at: string | null;
  last_seen_at: string | null;
  firmware_version: string | null;
  buffered_taps: number | null;
  reader_ok: boolean | null;
}

export interface MockData {
  event_services: MockEventService[];
  tokens: MockToken[];
  stations: MockStation[];
  /** Portal user IDs on the GeekyKey Service's admin list (agreement 10). */
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
    // Left the settings, so a station still linked to it reports a null name and
    // its taps would get no_event (agreement 10).
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

  const stations: MockStation[] = [
    {
      id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
      label: "Reader 3",
      created_at: iso(eventStart - minutes(140)),
      link: { event_service_id: SHOWCASE_ID, linked_at: iso(eventStart - minutes(135)) },
      disabled_at: null,
      last_seen_at: iso(now - 4_000),
      firmware_version: "0.3.1",
      buffered_taps: 0,
      reader_ok: true,
    },
    {
      id: "5b1d2c70-0c7e-4f7a-9d2e-2b1f6c8a3e41",
      label: "Reader 1",
      created_at: iso(eventStart - minutes(138)),
      link: { event_service_id: SHOWCASE_ID, linked_at: iso(eventStart - minutes(136)) },
      disabled_at: null,
      last_seen_at: iso(now - 11_000),
      firmware_version: "0.3.1",
      buffered_taps: 2,
      reader_ok: true,
    },
    {
      id: "e0f3a9b2-6c4d-4a1e-8f5b-7d2c9e1a0b63",
      label: "Reader 7",
      created_at: iso(eventStart - minutes(130)),
      link: { event_service_id: SHOWCASE_ID, linked_at: iso(eventStart - minutes(129)) },
      disabled_at: null,
      // Quiet for over two minutes, so `online` is false even though it has a key.
      last_seen_at: iso(now - minutes(14)),
      firmware_version: "0.2.9",
      buffered_taps: 0,
      reader_ok: false,
    },
    {
      id: "9a7c4e21-3f8b-4d6a-b2e5-1c0d8f7a6b59",
      label: "Reader 4",
      created_at: iso(eventStart - minutes(126)),
      link: { event_service_id: "e_4b19", linked_at: iso(eventStart - minutes(124)) },
      disabled_at: null,
      last_seen_at: iso(now - 27_000),
      firmware_version: "0.3.0",
      buffered_taps: 0,
      reader_ok: true,
    },
    {
      id: "2d6b8f04-9e1a-4c3d-a7f2-5e4b0c9d1a86",
      label: "Reader 9",
      created_at: iso(eventStart - minutes(112)),
      link: null,
      disabled_at: iso(now - minutes(63)),
      last_seen_at: iso(now - minutes(64)),
      firmware_version: "0.3.1",
      buffered_taps: 5,
      reader_ok: true,
    },
    {
      id: "71e5c3a8-2b9d-4f0e-8a6c-3d1f7b2e9c04",
      label: "Reader 12",
      created_at: iso(eventStart - minutes(30)),
      link: null,
      // Never checked in, so every heartbeat field is null (agreement 10).
      last_seen_at: null,
      disabled_at: null,
      firmware_version: null,
      buffered_taps: null,
      reader_ok: null,
    },
  ];

  return { event_services, tokens, stations, admins: [SEEDED_ADMIN_ID] };
}
