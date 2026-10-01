import type { Role, TapSource, TapStatus } from "@/api/types";

/*
  Seed data for the mock client. Deterministic (seeded PRNG) so tests are stable,
  but anchored to "now" so timestamps look live. Uneven numbers on purpose.
*/

export interface MockUser {
  id: string;
  portal_user_id: string;
  display_name: string | null;
  role: Role;
}

export interface MockToken {
  uid: string;
  user_id: string;
  paired_at: string;
  revoked_at: string | null;
}

export interface MockStation {
  id: string;
  name: string;
  location: string | null;
  points: number;
  created_at: string;
  last_seen_at: string | null;
  /** Mock only: whether the simulator keeps this station's heartbeat alive. */
  simulate_online: boolean;
  /** Mock only: whether this station counts taps toward a passport game. */
  counts_toward_passport: boolean;
}

export interface MockTap {
  id: number;
  station_id: string;
  client_tap_id: string;
  token_uid: string | null;
  user_id: string;
  source: TapSource;
  status: TapStatus;
  tapped_at: string | null;
  received_at: string;
}

export interface MockData {
  users: MockUser[];
  tokens: MockToken[];
  stations: MockStation[];
  taps: MockTap[];
}

/** Small deterministic PRNG (mulberry32). */
export function createRandom(seed: number): () => number {
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

export function createFixtures(now: number = Date.now()): MockData {
  const random = createRandom(20261010);
  const minutes = (n: number) => n * 60_000;

  const users: MockUser[] = [
    {
      id: SEEDED_PARTICIPANT_ID,
      portal_user_id: "dev-portal-1",
      display_name: "Alex Tan",
      role: "participant",
    },
    {
      id: SEEDED_ORGANIZER_ID,
      portal_user_id: "dev-portal-2",
      display_name: "Priya Raman",
      role: "organizer",
    },
    { id: "u_7f3a", portal_user_id: "p_1041", display_name: "Wei Lin Chong", role: "participant" },
    {
      id: "u_9c21",
      portal_user_id: "p_1042",
      display_name: "Farhan Iskandar",
      role: "participant",
    },
    { id: "u_2e8b", portal_user_id: "p_1047", display_name: "Kenji Ong", role: "participant" },
    { id: "u_b514", portal_user_id: "p_1053", display_name: "Hui Min Loh", role: "participant" },
    { id: "u_d0a9", portal_user_id: "p_1058", display_name: "Darren Koh", role: "participant" },
    { id: "u_44c7", portal_user_id: "p_1061", display_name: "Aisyah Rahman", role: "participant" },
    { id: "u_e1f2", portal_user_id: "p_1066", display_name: "Marcus Lim", role: "participant" },
    { id: "u_3b7d", portal_user_id: "p_1072", display_name: "Nurul Huda", role: "participant" },
    { id: "u_8a05", portal_user_id: "p_1079", display_name: "Jia Hao Ng", role: "participant" },
    { id: "u_c6e3", portal_user_id: "p_1083", display_name: "Siti Aminah", role: "participant" },
  ];

  const eventStart = now - minutes(137);

  const tokens: MockToken[] = [
    {
      uid: "04A1B2C3D4E5F6",
      user_id: SEEDED_PARTICIPANT_ID,
      paired_at: iso(eventStart - minutes(12)),
      revoked_at: null,
    },
    {
      uid: "04C9E1A27B3080",
      user_id: "u_7f3a",
      paired_at: iso(eventStart - minutes(9)),
      revoked_at: null,
    },
    {
      uid: "0455D2F1C83A91",
      user_id: "u_9c21",
      paired_at: iso(eventStart - minutes(8)),
      revoked_at: null,
    },
    {
      uid: "04B7702A1E4C33",
      user_id: "u_2e8b",
      paired_at: iso(eventStart - minutes(6)),
      revoked_at: null,
    },
    {
      uid: "043F8E5D22A710",
      user_id: "u_b514",
      paired_at: iso(eventStart - minutes(5)),
      revoked_at: null,
    },
    {
      uid: "04E23B9C71D058",
      user_id: "u_d0a9",
      paired_at: iso(eventStart - minutes(4)),
      revoked_at: null,
    },
    {
      uid: "0461A3C0F92B77",
      user_id: "u_44c7",
      paired_at: iso(eventStart - minutes(3)),
      revoked_at: null,
    },
    {
      uid: "04D8F04E6A1C29",
      user_id: "u_e1f2",
      paired_at: iso(eventStart + minutes(2)),
      revoked_at: null,
    },
    {
      uid: "04129BE7C3D6A4",
      user_id: "u_3b7d",
      paired_at: iso(eventStart + minutes(11)),
      revoked_at: null,
    },
    {
      uid: "04A77C1D0E5B92",
      user_id: "u_8a05",
      paired_at: iso(eventStart + minutes(19)),
      revoked_at: null,
    },
    {
      uid: "04F0C2A85D7E13",
      user_id: "u_c6e3",
      paired_at: iso(eventStart + minutes(24)),
      revoked_at: null,
    },
    // A token that was lost and unpaired: stays in history, can be paired again.
    {
      uid: "04A1B2C3D4E5F7",
      user_id: "u_7f3a",
      paired_at: iso(eventStart - minutes(40)),
      revoked_at: iso(eventStart - minutes(15)),
    },
  ];

  const stations: MockStation[] = [
    {
      id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
      name: "3D Printing Booth",
      location: "Hall A",
      points: 1,
      created_at: iso(eventStart - minutes(90)),
      last_seen_at: iso(now - 4_000),
      simulate_online: true,
      counts_toward_passport: true,
    },
    {
      id: "5b1d2c70-0c7e-4f7a-9d2e-2b1f6c8a3e41",
      name: "Cloud Sponsor",
      location: "Hall B",
      points: 2,
      created_at: iso(eventStart - minutes(88)),
      last_seen_at: iso(now - 11_000),
      simulate_online: true,
      counts_toward_passport: true,
    },
    {
      id: "e0f3a9b2-6c4d-4a1e-8f5b-7d2c9e1a0b63",
      name: "Hardware Lab",
      location: "Hall A",
      points: 1,
      created_at: iso(eventStart - minutes(85)),
      last_seen_at: iso(now - minutes(14)),
      simulate_online: false,
      counts_toward_passport: true,
    },
    {
      id: "9a7c4e21-3f8b-4d6a-b2e5-1c0d8f7a6b59",
      name: "Mentor Lounge",
      location: "Level 2",
      points: 1,
      created_at: iso(eventStart - minutes(80)),
      last_seen_at: iso(now - 27_000),
      simulate_online: true,
      counts_toward_passport: true,
    },
    {
      id: "2d6b8f04-9e1a-4c3d-a7f2-5e4b0c9d1a86",
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      created_at: iso(eventStart - minutes(70)),
      last_seen_at: iso(now - 8_000),
      simulate_online: true,
      counts_toward_passport: true,
    },
    {
      id: "71e5c3a8-2b9d-4f0e-8a6c-3d1f7b2e9c04",
      name: "Photo Wall",
      location: "Foyer",
      points: 0,
      created_at: iso(eventStart - minutes(30)),
      last_seen_at: null,
      simulate_online: false,
      counts_toward_passport: false,
    },
  ];

  const onlineStations = stations.filter((s) => s.simulate_online);
  const participants = users.filter((u) => u.role === "participant");
  const activeTokenByUser = new Map(
    tokens.filter((t) => !t.revoked_at).map((t) => [t.user_id, t.uid]),
  );

  const taps: MockTap[] = [];
  const lastAccepted = new Map<string, number>();
  let nextId = 1;
  let counter = 100;

  const pushTap = (
    stationId: string,
    userId: string,
    uid: string | null,
    at: number,
    source: TapSource,
  ) => {
    const station = stations.find((item) => item.id === stationId);
    let status: TapStatus = station?.counts_toward_passport ? "accepted" : "no_game";
    if (station?.counts_toward_passport) {
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
      token_uid: uid,
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
    if (station && participant) {
      const roll = random();
      const uid = activeTokenByUser.get(participant.id) ?? "04DEADBEEF0000";
      pushTap(station.id, participant.id, uid, clock, "nfc");
      // Occasionally the same person taps again straight away.
      if (roll > 0.88) pushTap(station.id, participant.id, uid, clock + 4_000, "nfc");
    }
    clock += 40_000 + random() * 140_000;
  }

  // The seeded participant has a deliberate story: two stamps, one cooldown, one no_game.
  const alexUid = "04A1B2C3D4E5F6";
  const printing = stations[0];
  const cloud = stations[1];
  const lounge = stations[3];
  const photoWall = stations[5];
  if (printing && cloud && lounge && photoWall) {
    pushTap(printing.id, SEEDED_PARTICIPANT_ID, alexUid, eventStart + minutes(9), "nfc");
    pushTap(cloud.id, SEEDED_PARTICIPANT_ID, alexUid, eventStart + minutes(41), "nfc");
    pushTap(cloud.id, SEEDED_PARTICIPANT_ID, alexUid, eventStart + minutes(43), "nfc");
    pushTap(lounge.id, SEEDED_PARTICIPANT_ID, alexUid, now - minutes(6), "qr_fallback");
    pushTap(photoWall.id, SEEDED_PARTICIPANT_ID, alexUid, now - minutes(4), "nfc");
  }

  // Two organiser fallbacks earlier in the day.
  const careers = stations[4];
  if (careers) {
    pushTap(
      careers.id,
      "u_44c7",
      activeTokenByUser.get("u_44c7") ?? null,
      eventStart + minutes(55),
      "qr_fallback",
    );
    pushTap(
      careers.id,
      "u_3b7d",
      activeTokenByUser.get("u_3b7d") ?? null,
      eventStart + minutes(96),
      "qr_fallback",
    );
  }

  taps.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  taps.forEach((tap, index) => {
    tap.id = index + 1;
  });

  return { users, tokens, stations, taps };
}
