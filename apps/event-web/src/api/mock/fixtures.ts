import type {
  AcceptConnectionRequestStatus,
  ConnectAcross,
  Connection,
  ConnectionRequest,
  GroupPlacedHow,
  Question,
  Role,
  TapSource,
  TapStatus,
} from "@/api/types";

/*
  Seed data for the mock client. Deterministic (seeded PRNG) so tests are stable,
  but anchored to "now" so timestamps look live. Uneven numbers on purpose.
*/

/** A request as the mock keeps it. `accept_answer` is what accepting it says: `connected` if absent. */
export interface MockConnectionRequest extends ConnectionRequest {
  accept_answer?: AcceptConnectionRequestStatus;
  /** The game accepting gives the pair: dice if absent (BAC-156). */
  accept_game?: "dice" | "reaction";
}

/**
 * A connection as the mock keeps it. In a reaction test, `reaction` holds this user's play as
 * kept, and `their_ms` is the other person's, which the mock's /me hides until the result, as the
 * Event Service does: a time, null for a tap too soon, or absent until they play (BAC-156).
 */
export interface MockConnection extends Connection {
  their_ms?: number | null;
}

export interface MockUser {
  id: string;
  display_name: string | null;
  role: Role;
  has_name: boolean;
  answers?: Record<string, string>;
  /** Absent reads as none, as it does for `contact_line` (BAC-147). */
  bio?: string | null;
  contact_line?: string | null;
  /** Waiting for this user to accept or decline, newest first (BAC-149). Absent reads as none. */
  connection_requests?: MockConnectionRequest[];
  /**
   * Newest first. `shared` holds what the pair share from the start, and the mock's /me hides it
   * until `shared_at`, as the Event Service does.
   */
  connections?: MockConnection[];
}

/**
 * One row of the Event Service's `stations` table, reshaped as version 0.3 of the
 * migration spec describes. The old pre-0.3 fields (`name`, `location`, `points`) are
 * gone: the device's name is `label`, and its passport name, location and points live in
 * `passport`, which is null until 9.1 adds them.
 */
export interface MockStation {
  id: string;
  label: string;
  created_at: string;
  /** When an organizer disabled it (9.9), or null while it is enabled. */
  disabled_at: string | null;
  passport: {
    name: string;
    location: string | null;
    points: number;
    link: string | null;
    added_at: string;
  } | null;
  /**
   * The booth it stands at (agreement 9.12), free text the map matches to its floor plan. The
   * fixtures use the example plan's codes, plus one the plan doesn't name.
   */
  booth: string | null;
  /** Set by every hand-off, so a station created by 9.7 and not yet heard from has none. */
  last_seen_at: string | null;
  /** Set by a heartbeat's hand-off. */
  firmware_version: string | null;
  buffered_taps: number | null;
  reader_ok: boolean | null;
  /** Mock only: whether the simulator keeps this station's heartbeat alive. */
  simulate_online: boolean;
}

export interface MockTap {
  id: number;
  station_id: string;
  client_tap_id: string;
  user_id: string;
  source: TapSource;
  status: TapStatus;
  tapped_at: string | null;
  received_at: string;
}

/** One row of the Event Service's `participant_groups`. */
export interface MockGroup {
  id: string;
  name: string;
  tags: string[];
  location: string | null;
  capacity: number | null;
}

/** One row of the Event Service's `group_members`: someone who has joined. */
export interface MockGroupMember {
  user_id: string;
  group_id: string | null;
  joined_at: string;
  placed_at: string | null;
  how: GroupPlacedHow | null;
}

export interface MockData {
  users: MockUser[];
  stations: MockStation[];
  taps: MockTap[];
  /** The event's answers game, or null when it has none. */
  questions: Question[] | null;
  /** Oldest first. */
  groups: MockGroup[];
  /** Joined order. */
  groupMembers: MockGroupMember[];
  /** When an organizer first pressed Allocate, or null before that. */
  groupAllocationStartedAt: string | null;
  /** What connections need, which a new event starts as token kinds (BAC-140). */
  connectAcross: ConnectAcross;
}

/**
 * The Event Service's placeholder questions (BAC-119). They mirror
 * apps/event-service/src/grad-tea/questions.ts, so the mock asks what the service asks.
 * The grad tea team replaces them by Mon 9 Nov; a reworded one keeps its IDs.
 */
const QUESTIONS: Question[] = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
  {
    id: "hours",
    text: "Night owl or early bird?",
    choices: [
      { id: "night_owl", text: "Night owl" },
      { id: "early_bird", text: "Early bird" },
    ],
  },
  {
    id: "school",
    text: "Best part of school?",
    choices: [
      { id: "friends", text: "Friends" },
      { id: "cca", text: "CCA" },
      { id: "camps", text: "Camps" },
      { id: "food", text: "The food" },
    ],
  },
  {
    id: "superpower",
    text: "Pick a superpower",
    choices: [
      { id: "fly", text: "Fly" },
      { id: "invisibility", text: "Invisibility" },
      { id: "reading_minds", text: "Reading minds" },
      { id: "time_travel", text: "Time travel" },
    ],
  },
  {
    id: "weekend",
    text: "Your weekend?",
    choices: [
      { id: "friends", text: "Out with friends" },
      { id: "home", text: "At home" },
      { id: "sport", text: "Sport" },
      { id: "games", text: "Games" },
    ],
  },
];

/** Small deterministic PRNG (mulberry32). */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

export const SEEDED_PARTICIPANT_ID = "dev-user-1";
export const SEEDED_ORGANIZER_ID = "dev-organizer-1";
/** A guest who has not set a name yet, so the passport asks for one (agreement 8.1). */
export const SEEDED_GUEST_ID = "u_a6f0";

export function createFixtures(now: number = Date.now()): MockData {
  const random = createRandom(20261010);
  const minutes = (n: number) => n * 60_000;
  /** What `shared_at` is for a connection made that long ago: 2 minutes after it (8.1). */
  const connection = (msAgo: number, fields: Omit<Connection, "connected_at" | "shared_at">) => ({
    ...fields,
    connected_at: new Date(now - msAgo).toISOString(),
    shared_at: new Date(now - msAgo + minutes(2)).toISOString(),
  });

  const users: MockUser[] = [
    {
      id: SEEDED_PARTICIPANT_ID,
      display_name: "Alex Tan",
      role: "participant",
      has_name: true,
      bio: "Second-year CS. Building a robot arm that can pour teh tarik.",
      contact_line: "@alextan on Telegram",
      answers: {
        drink: "tea",
        hours: "night_owl",
        school: "cca",
        superpower: "time_travel",
        weekend: "games",
      },
      connection_requests: [
        {
          id: "cr_3f1a",
          // Accepting her in pnpm dev starts a reaction test, so it can be tried (BAC-156).
          accept_game: "reaction",
          display_name: "Mei Lin Koh",
          bio: "Into robotics and good coffee. Looking for someone to build with.",
          requested_at: new Date(now - 38_000).toISOString(),
        },
      ],
      // A new connection, one whose `shared` has arrived, and one with no match and no name. The fixtures
      // start again from "now" at each page load, so a dismissed reveal comes back on a reload
      // here, and only here: the Event Service's `connected_at` doesn't move.
      connections: [
        connection(47_000, {
          display_name: "Wei Lin Chong",
          dice: { your_roll: 5, their_roll: 2, result: "win" },
          bio: "Looking for a hardware teammate. Ask me about sensors and sourdough.",
          contact_line: "@weilin_c on Telegram",
          kind: "B",
          match: 60,
          shared: ["drink", "school", "weekend"],
        }),
        connection(minutes(26), {
          display_name: "Farhan Iskandar",
          dice: { your_roll: 3, their_roll: 6, result: "loss" },
          bio: null,
          contact_line: "farhan.i@example.com",
          kind: "G",
          match: 80,
          shared: ["drink", "hours", "superpower", "weekend"],
        }),
        connection(minutes(58), {
          display_name: null,
          bio: null,
          contact_line: null,
          kind: "B",
          match: null,
          shared: [],
        }),
      ],
    },
    {
      id: SEEDED_ORGANIZER_ID,
      display_name: "Priya Raman",
      role: "organizer",
      has_name: true,
    },
    { id: "u_7f3a", display_name: "Wei Lin Chong", role: "participant", has_name: true },
    {
      id: "u_9c21",
      display_name: "Farhan Iskandar",
      role: "participant",
      has_name: true,
    },
    { id: "u_2e8b", display_name: "Kenji Ong", role: "participant", has_name: true },
    { id: "u_b514", display_name: "Hui Min Loh", role: "participant", has_name: true },
    { id: "u_d0a9", display_name: "Darren Koh", role: "participant", has_name: true },
    { id: "u_44c7", display_name: "Aisyah Rahman", role: "participant", has_name: true },
    { id: "u_e1f2", display_name: "Marcus Lim", role: "participant", has_name: true },
    { id: "u_3b7d", display_name: "Nurul Huda", role: "participant", has_name: true },
    { id: "u_8a05", display_name: "Jia Hao Ng", role: "participant", has_name: true },
    { id: "u_c6e3", display_name: "Siti Aminah", role: "participant", has_name: true },
  ];

  const eventStart = now - minutes(137);

  const stations: MockStation[] = [
    {
      id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
      label: "Station 1",
      created_at: iso(eventStart - minutes(90)),
      disabled_at: null,
      passport: {
        name: "3D Printing Booth",
        location: "Hall A",
        points: 1,
        link: "https://example.com/3d-printing",
        added_at: iso(eventStart - minutes(60)),
      },
      booth: "B1",
      last_seen_at: iso(now - 4_000),
      firmware_version: "0.3.1",
      buffered_taps: 0,
      reader_ok: true,
      simulate_online: true,
    },
    {
      id: "5b1d2c70-0c7e-4f7a-9d2e-2b1f6c8a3e41",
      label: "Station 2",
      created_at: iso(eventStart - minutes(88)),
      disabled_at: null,
      passport: {
        name: "Cloud Sponsor",
        location: "Hall B",
        points: 2,
        link: null,
        added_at: iso(eventStart - minutes(70)),
      },
      booth: "B4",
      last_seen_at: iso(now - 11_000),
      firmware_version: "0.3.1",
      buffered_taps: 0,
      reader_ok: true,
      simulate_online: true,
    },
    {
      // Offline, not in the passport, and its reader is not responding, so the board has
      // all three of its faults on one row.
      id: "e0f3a9b2-6c4d-4a1e-8f5b-7d2c9e1a0b63",
      label: "Station 3",
      created_at: iso(eventStart - minutes(85)),
      disabled_at: null,
      passport: null,
      booth: "C3",
      last_seen_at: iso(now - minutes(14)),
      firmware_version: "0.2.9",
      buffered_taps: 0,
      reader_ok: false,
      simulate_online: false,
    },
    {
      id: "9a7c4e21-3f8b-4d6a-b2e5-1c0d8f7a6b59",
      label: "Station 4",
      created_at: iso(eventStart - minutes(80)),
      disabled_at: null,
      passport: {
        name: "Mentor Lounge",
        location: "Level 2",
        points: 1,
        link: null,
        added_at: iso(eventStart - minutes(55)),
      },
      booth: "A2",
      last_seen_at: iso(now - 27_000),
      firmware_version: "0.3.0",
      buffered_taps: 0,
      reader_ok: true,
      simulate_online: true,
    },
    {
      // Holding saved taps. The old shape's "no longer linked" fixture is gone with
      // `linked`: a station always feeds the Event Service that registered it. Its booth is
      // one the example floor plan doesn't name, so the map lists it beside the plan.
      id: "2d6b8f04-9e1a-4c3d-a7f2-5e4b0c9d1a86",
      label: "Station 5",
      created_at: iso(eventStart - minutes(70)),
      disabled_at: null,
      passport: {
        name: "Careers Corner",
        location: "Hall B",
        points: 2,
        link: null,
        added_at: iso(eventStart - minutes(45)),
      },
      booth: "D2",
      last_seen_at: iso(now - 8_000),
      firmware_version: "0.3.1",
      buffered_taps: 3,
      reader_ok: true,
      simulate_online: true,
    },
    {
      // Never reported a heartbeat, so the three heartbeat fields are null, and it has no
      // passport settings yet.
      id: "71e5c3a8-2b9d-4f0e-8a6c-3d1f7b2e9c04",
      label: "Station 6",
      created_at: iso(eventStart - minutes(30)),
      disabled_at: null,
      passport: null,
      booth: null,
      last_seen_at: iso(now - 20_000),
      firmware_version: null,
      buffered_taps: 0,
      reader_ok: null,
      simulate_online: true,
    },
    {
      // Disabled (9.9). Its key stopped working within a minute of `disabled_at`, so it has
      // not been heard from since. It keeps its passport settings and its slot and stamps
      // (9.2), which is why it still carries a passport.
      id: "3d7e5a91-6c2b-4f18-9d40-2a8e6b3c7f52",
      label: "Station 7",
      created_at: iso(eventStart - minutes(65)),
      disabled_at: iso(now - minutes(5)),
      passport: {
        name: "Info Desk",
        location: "Foyer",
        points: 1,
        link: null,
        added_at: iso(eventStart - minutes(40)),
      },
      booth: "C1",
      last_seen_at: iso(now - minutes(6)),
      firmware_version: "0.3.1",
      buffered_taps: 0,
      reader_ok: true,
      simulate_online: false,
    },
  ];

  const onlineStations = stations.filter((s) => s.simulate_online);
  const participants = users.filter((u) => u.role === "participant");

  const taps: MockTap[] = [];
  const lastAccepted = new Map<string, number>();
  let nextId = 1;
  let counter = 100;

  const pushTap = (stationId: string, userId: string, at: number, source: TapSource) => {
    const station = stations.find((item) => item.id === stationId);
    // A station without passport settings is not in the game (agreement 9.2).
    const inGame = Boolean(station?.passport);
    let status: TapStatus = inGame ? "accepted" : "no_game";
    if (inGame) {
      const key = `${userId}:${stationId}`;
      const previous = lastAccepted.get(key);
      if (previous !== undefined && at - previous < 300_000) status = "cooldown";
      else lastAccepted.set(key, at);
    }
    taps.push({
      id: nextId++,
      station_id: stationId,
      client_tap_id:
        source === "nfc" ? `tap-${String(counter++).padStart(6, "0")}` : crypto.randomUUID(),
      user_id: userId,
      source,
      status,
      tapped_at: source === "nfc" && random() < 0.85 ? iso(at - 900) : null,
      received_at: iso(at),
    });
  };

  // Ordinary event traffic, oldest first, over the last two hours or so.
  let clock = eventStart + minutes(3);
  while (clock < now - 20_000) {
    const station =
      onlineStations[Math.floor(random() * onlineStations.length)] ?? onlineStations[0];
    const participant = participants[Math.floor(random() * participants.length)] ?? participants[0];
    const roll = random();
    // The seeded participant only has the story below, so their passport keeps an empty slot.
    if (station && participant && participant.id !== SEEDED_PARTICIPANT_ID) {
      pushTap(station.id, participant.id, clock, "nfc");
      // Occasionally the same person taps again straight away.
      if (roll > 0.88) pushTap(station.id, participant.id, clock + 4_000, "nfc");
    }
    clock += 40_000 + random() * 140_000;
  }

  // The seeded participant has a deliberate story: three stamps, one cooldown, one no_game.
  const printing = stations[0];
  const cloud = stations[1];
  const lounge = stations[3];
  const photoWall = stations[5];
  if (printing && cloud && lounge && photoWall) {
    pushTap(printing.id, SEEDED_PARTICIPANT_ID, eventStart + minutes(9), "nfc");
    pushTap(cloud.id, SEEDED_PARTICIPANT_ID, eventStart + minutes(41), "nfc");
    pushTap(cloud.id, SEEDED_PARTICIPANT_ID, eventStart + minutes(43), "nfc");
    pushTap(lounge.id, SEEDED_PARTICIPANT_ID, now - minutes(6), "qr_fallback");
    pushTap(photoWall.id, SEEDED_PARTICIPANT_ID, now - minutes(4), "nfc");
  }

  // Two organiser fallbacks earlier in the day.
  const careers = stations[4];
  if (careers) {
    pushTap(careers.id, "u_44c7", eventStart + minutes(55), "qr_fallback");
    pushTap(careers.id, "u_3b7d", eventStart + minutes(96), "qr_fallback");
  }

  /*
    Someone who has never logged in to this event. The Event Service only creates
    a user row on login, so this ID is deliberately absent from `users` and the
    scan log and export both show a null display name for it.
  */
  if (printing) {
    pushTap(printing.id, "u_9d4f", now - minutes(9), "nfc");
  }

  taps.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  taps.forEach((tap, index) => {
    tap.id = index + 1;
  });

  /*
    A guest who has just arrived from the GeekyKey screens: the default name, no name of
    their own and no taps in the fixtures. Added after the taps, so the random taps above
    stay as they were. The simulator can give them taps later, as it does any participant.
  */
  users.push({ id: SEEDED_GUEST_ID, display_name: "Guest", role: "participant", has_name: false });

  // Two groups and an odd number waiting, so Allocate has something to split unevenly.
  const groups: MockGroup[] = [
    { id: "g_foyer", name: "Foyer mixer", tags: [], location: null, capacity: null },
    { id: "g_atrium", name: "Atrium mixer", tags: [], location: null, capacity: null },
  ];
  const groupMembers: MockGroupMember[] = ["u_7f3a", "u_9c21", "u_2e8b", "u_b514", "u_d0a9"].map(
    (user_id, index) => ({
      user_id,
      group_id: null,
      joined_at: new Date(now - minutes(11 - 2 * index)).toISOString(),
      placed_at: null,
      how: null,
    }),
  );

  return {
    users,
    stations,
    taps,
    questions: QUESTIONS,
    groups,
    groupMembers,
    groupAllocationStartedAt: null,
    connectAcross: "token_kinds",
  };
}
