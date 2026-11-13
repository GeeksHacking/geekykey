import { mockDuelRound, scoreReactions, type RoundScenario } from "@/api/mock/duel-round";
import type { ApiClient } from "@/api/client";
import { ApiError, NetworkError, publishAuthError } from "@/api/errors";
import {
  createFixtures,
  SEEDED_GUEST_ID,
  SEEDED_PARTICIPANT_ID,
  type MockData,
  type MockGroup,
  type MockStation,
  type MockTap,
  type MockConnection,
  type MockConnectionRequest,
  type MockUser,
} from "@/api/mock/fixtures";
import {
  type AcceptConnectionRequestResponse,
  type Connection,
  type GeekykeyLoginLinkResponse,
  type PlayReactionResponse,
  type Reaction,
  EXPORT_CSV_COLUMNS,
  GROUPS_EXPORT_CSV_COLUMNS,
  type AdminTap,
  type ApiIssue,
  CHALLENGES,
  CONNECT_ACROSS,
  type ConnectionChallenge,
  type ConnectionWord,
  type ConnectionRule,
  type CreateGroupRequest,
  type SplitGroupsRequest,
  type CreateStationRequest,
  type StationKeyResponse,
  type ErrorCode,
  type EventGame,
  type EventGroup,
  type EventStationBoardResponse,
  type EventStationBoardStation,
  type FallbackTapRequest,
  type FallbackTapResponse,
  type FallbackTapStatus,
  type GroupBoardResponse,
  type ListTapsQuery,
  type ListTapsResponse,
  type MapResponse,
  type MapStation,
  type MeResponse,
  type MyGroupResponse,
  type UpdateGroupRequest,
  type SetPhraseRequest,
  type SetStationPassportResponse,
  type StationResponse,
  type StatsResponse,
  type TapStatus,
  type UpdateMeRequest,
  type UpdateMeResponse,
} from "@/api/types";
import { BOOTH_MAX, isBooth } from "@/lib/booth";
import { MOCK_LATENCY_MS, STATION_ONLINE_WINDOW_MS } from "@/lib/constants";
import { isDisplayName } from "@/lib/display-name";
import { isGroupLink } from "@/lib/group-link";
import {
  GROUP_TAGS_MAX,
  GROUP_TEXT_MAX,
  isGroupText,
  PEOPLE_PER_GROUP_MIN,
  splitGroupCount,
  GROUP_COUNT_MIN,
} from "@/lib/group-fields";
import { phraseProblem, phraseWords } from "@/lib/phrase";
import { BIO_MAX, CONTACT_LINE_MAX, fitsLimit } from "@/lib/profile";

/**
 * The mock's anonymous web, oldest connection first. Each link joins numbers a few apart, so
 * the spiral reads as a web rather than a ring. The map shows the first 30 links and adds one
 * per read, so the screen's web grows over a few polls as the event's would.
 */
const MAP_CONNECTIONS: [number, number][] = Array.from({ length: 60 }, (_, index) => {
  const first = index + 1;
  const second = index + 2 + (index % 5);
  const pair: [number, number] = [first, second];
  return pair;
});

/** How many links the first map read shows. Each later read adds one, up to the list. */
const MAP_LINKS_AT_FIRST_READ = 30;

/** How long each person has to play a connection's reaction test (BAC-156, 8.1). */
const REACTION_WINDOW_MS = 120_000;

/**
 * A reaction test from the user's side now, as the Event Service gives it: a play left too long
 * is missed, the result comes once neither can still play, and until then the other person's
 * time stays hidden and a tap too soon of theirs looks like any play (agreement 8.1, BAC-156).
 */
function reactionNow(kept: Reaction, theirMs: number | null | undefined): Reaction {
  const over = Date.now() >= Date.parse(kept.play_by);
  const yourPlay = kept.your_play === "not_played" && over ? "missed" : kept.your_play;
  const theirPlay =
    theirMs === undefined
      ? over
        ? "missed"
        : "not_played"
      : theirMs === null
        ? "early"
        : "played";
  const base = { play_by: kept.play_by, your_play: yourPlay, your_ms: kept.your_ms };
  if (yourPlay === "not_played" || theirPlay === "not_played") {
    return {
      ...base,
      their_play: theirPlay === "early" ? "played" : theirPlay,
      their_ms: null,
      result: null,
    };
  }
  const yours = yourPlay === "played" ? kept.your_ms : null;
  const theirs = theirPlay === "played" ? (theirMs ?? null) : null;
  const win = yours !== null && (theirs === null || yours <= theirs);
  return { ...base, their_play: theirPlay, their_ms: theirs, result: win ? "win" : "loss" };
}

/*
  In-memory stand-in for apps/event-service. Same interface as the future HTTP
  client, same shapes as API-AGREEMENT.md, same status codes. It also mirrors
  the two backend rules screens need to see in action (cooldown, one-time
  station key), purely so the mock feels like the real thing. The frontend
  proper never computes these.
*/

const COOLDOWN_MS = 300_000;
const SESSION_KEY = "gk-mock-session";
/**
 * The login links the mock accepts, and who each logs in: open `/#login=mock` to arrive as
 * from a token, or `/#login=guest` to arrive as a guest who has no name yet.
 */
const MOCK_LOGIN_LINKS: Record<string, string> = {
  mock: SEEDED_PARTICIPANT_ID,
  guest: SEEDED_GUEST_ID,
};

/**
 * 9.2's `games`, in the order to show them. The Event Service's showcase lists these three
 * (BAC-184), and 9.11 refuses any id that isn't here.
 */
const STATION_GAMES: EventGame[] = [
  { id: "passport", name: "Passport" },
  { id: "team_duels", name: "Team duels" },
  { id: "relay", name: "Relay" },
];

const HTTP_STATUS: Record<ErrorCode, number> = {
  name_taken: 409,
  no_groups: 409,
  too_few_participants: 409,
  groups_exist: 409,
  validation_failed: 400,
  unauthenticated: 401,
  // Agreement 0.4 section 7.2, POST /auth/firebase, on both services.
  invalid_token: 401,
  // Agreement 0.5 section 7.4, POST /auth/login-link, on the Event Service.
  invalid_login_link: 401,
  missing_station_key: 401,
  invalid_station_key: 401,
  forbidden: 403,
  not_found: 404,
  answers_fixed: 409,
  already_played: 409,
  too_late: 409,
  rate_limited: 429,
  invalid_event_service_key: 401,
  event_service_unavailable: 503,
  claims_unavailable: 503,
  login_unavailable: 503,
  service_unavailable: 503,
  internal_error: 500,
};

export type MockFailure = ErrorCode | "network";

export interface MockClientOptions {
  data?: MockData;
  roundScenario?: RoundScenario;
  /** [min, max] simulated latency. Use [0, 0] in tests. */
  latencyMs?: readonly [number, number];
  /** Keep online stations alive and append new taps over time. */
  simulate?: boolean;
  now?: () => number;
  /** Where the fake session cookie lives. Pass null to keep it in memory only. */
  storage?: Storage | null;
}

export interface MockControls {
  /** Make the next call reject with this error, then behave normally again. */
  failNext(failure: MockFailure): void;
  /** Sign in without going through devLogin. Tests only. */
  setSession(userId: string | null): void;
  readonly data: MockData;
  stop(): void;
}

export type MockApiClient = ApiClient & { mock: MockControls };

export function createMockClient(options: MockClientOptions = {}): MockApiClient {
  const now = options.now ?? (() => Date.now());
  const data = options.data ?? createFixtures(now());
  const latency = options.latencyMs ?? MOCK_LATENCY_MS;
  const storage = options.storage === undefined ? safeSessionStorage() : options.storage;

  let sessionUserId: string | null = storage?.getItem(SESSION_KEY) ?? null;
  let pendingFailure: MockFailure | null = null;
  let nextTapId = data.taps.reduce((max, tap) => Math.max(max, tap.id), 0) + 1;
  let mapReads = 0;

  const scenario = options.roundScenario;
  let round = scenario ? mockDuelRound(scenario, now()) : null;
  function roundNow() {
    if (!round) return null;
    if (scenario === "live" && round.state === "opening" && now() >= Date.parse(round.closes_at)) {
      round = { ...mockDuelRound("playing", Date.parse(round.closes_at)), id: round.id };
    }
    if (round.state === "playing") {
      round.duels = round.duels.map((duel) => ({
        ...duel,
        reaction: duel.reaction
          ? reactionNow(duel.reaction, scenario === "timeout" ? undefined : 350)
          : null,
      }));
      if (round.duels.every((duel) => duel.reaction?.result !== null)) {
        round = {
          ...round,
          state: "ended",
          result: scoreReactions(
            round.duels.flatMap((duel) => (duel.reaction ? [duel.reaction] : [])),
          ),
        };
      }
    }
    return structuredClone(round);
  }

  const iso = (ms: number) => new Date(ms).toISOString();

  // The live clients skip the auth error for the session's own GET /me, because a 401 there
  // means nobody is signed in. Each call keeps its own flag, so calls that overlap during the
  // simulated latency cannot change each other's.
  async function call<T>(work: () => T, publishAuth = true): Promise<T> {
    const [min, max] = latency;
    const wait = min + Math.random() * Math.max(0, max - min);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      if (pendingFailure) {
        const failure = pendingFailure;
        pendingFailure = null;
        if (failure === "network") throw new NetworkError();
        throw new ApiError(HTTP_STATUS[failure], failure);
      }
      return work();
    } catch (error) {
      if (publishAuth) publishAuthError(error);
      throw error;
    }
  }

  // Explicit type so TypeScript treats a bare `fail(...)` statement as the end of that path.
  const fail: (code: ErrorCode, issues?: ApiIssue[], needed?: number) => never = (
    code,
    issues,
    needed,
  ) => {
    throw new ApiError(HTTP_STATUS[code], code, issues, needed);
  };

  function currentUser(): MockUser {
    const user = sessionUserId ? data.users.find((u) => u.id === sessionUserId) : undefined;
    return user ?? fail("unauthenticated");
  }

  /** The request waiting for the user, taken off their list, or `not_found`. */
  function takeConnectionRequest(user: MockUser, requestId: string): MockConnectionRequest {
    const request = user.connection_requests?.find(({ id }) => id === requestId);
    if (!request) fail("not_found");
    user.connection_requests = user.connection_requests?.filter((item) => item !== request);
    return request;
  }

  function currentOrganizer(): MockUser {
    const user = currentUser();
    return user.role === "organizer" ? user : fail("forbidden");
  }

  function setSession(userId: string | null) {
    sessionUserId = userId;
    if (userId) storage?.setItem(SESSION_KEY, userId);
    else storage?.removeItem(SESSION_KEY);
  }

  const toUser = (user: MockUser) => ({
    id: user.id,
    display_name: user.display_name,
    role: user.role,
    has_name: user.has_name,
    answers: user.answers ?? {},
    bio: user.bio ?? null,
    contact_line: user.contact_line ?? null,
  });

  const stationById = (id: string) => data.stations.find((s) => s.id === id);
  const userById = (id: string) => data.users.find((u) => u.id === id);

  /**
   * The taps at a station that a game judged: `accepted` or `cooldown`, never `no_game`.
   * 9.10 counts them for the map, whichever game the station ran then.
   */
  const countedTapsAt = (station: MockStation) =>
    data.taps.filter((tap) => tap.station_id === station.id && tap.status !== "no_game");

  /** Event rule mirrored for realism: stations without passport settings return no_game; repeated recent taps are cooldowns. */
  function resolveStatus(userId: string, stationId: string, atMs: number): TapStatus {
    const station = stationById(stationId);
    if (!station?.passport) return "no_game";
    const recent = data.taps.some(
      (t) =>
        t.user_id === userId &&
        t.station_id === stationId &&
        t.status === "accepted" &&
        atMs - new Date(t.received_at).getTime() < COOLDOWN_MS,
    );
    return recent ? "cooldown" : "accepted";
  }

  function appendTap(tap: Omit<MockTap, "id">): MockTap {
    const stored: MockTap = { id: nextTapId++, ...tap };
    data.taps.push(stored);
    return stored;
  }

  /**
   * The game a station runs (9.2). A station with no explicit game runs the passport when it
   * has passport settings, as the migration to 0.7 gave every such station; the rest run none.
   */
  const gameOf = (station: MockStation) =>
    station.game === undefined ? (station.passport ? "passport" : null) : station.game;

  // The stamp slots (section 4): stations with passport settings, oldest settings first, so
  // adding one never moves the others. The passport (8.1) and the stats (9.5) list these.
  const stampSlots = () =>
    data.stations
      .flatMap((station) =>
        station.passport && gameOf(station) === "passport"
          ? [{ id: station.id, ...station.passport }]
          : [],
      )
      .sort((a, b) => a.added_at.localeCompare(b.added_at));

  /**
   * Agreement 9.2. Every field comes from the Event Service's own station row, since
   * version 0.3 removed the status call this board used to sit behind. `online` is
   * recomputed on each read so a poll reflects the wall clock, and a station that has
   * never handed off reads as offline.
   */
  function toStationBoardStation(station: MockStation): EventStationBoardStation {
    const lastTap = data.taps
      .filter((tap) => tap.station_id === station.id && tap.source === "nfc")
      .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
    const seen = station.last_seen_at ? new Date(station.last_seen_at).getTime() : null;
    return {
      id: station.id,
      label: station.label,
      created_at: station.created_at,
      disabled_at: station.disabled_at,
      game: gameOf(station),
      // 9.2 keeps game_fixed for one version and always gives false, since a station's game
      // can change at any time (9.11). The screens don't read it.
      game_fixed: false,
      booth: station.booth,
      passport: station.passport,
      last_seen_at: station.last_seen_at,
      online: seen !== null && now() - seen < STATION_ONLINE_WINDOW_MS,
      firmware_version: station.firmware_version,
      buffered_taps: station.buffered_taps,
      reader_ok: station.reader_ok,
      last_tap_at: lastTap?.received_at ?? null,
    };
  }

  /** The name the Event Service reads from its users table for a member. */
  function memberName(userId: string): string {
    return userById(userId)?.display_name ?? "Guest";
  }

  /**
   * The other groups `groupId` has reached, oldest first, as the Event Service works it out
   * (BAC-167): one of its members has a connection with one of theirs, by the groups now.
   */
  function reachedGroupIds(groupId: string): string[] {
    const groupOf = new Map(
      data.groupMembers.flatMap(({ user_id, group_id }) => (group_id ? [[user_id, group_id]] : [])),
    );
    const reached = new Set<string>();
    for (const [one, other] of data.connectedPairs) {
      const [oneGroup, otherGroup] = [groupOf.get(one), groupOf.get(other)];
      if (!oneGroup || !otherGroup || oneGroup === otherGroup) continue;
      if (oneGroup === groupId) reached.add(otherGroup);
      if (otherGroup === groupId) reached.add(oneGroup);
    }
    return data.groups.filter(({ id }) => reached.has(id)).map(({ id }) => id);
  }

  function toEventGroup(group: MockGroup): EventGroup {
    return {
      ...group,
      reached_group_ids: reachedGroupIds(group.id),
      members: data.groupMembers.flatMap((member) =>
        member.group_id === group.id && member.placed_at !== null && member.how !== null
          ? [
              {
                user_id: member.user_id,
                display_name: memberName(member.user_id),
                joined_at: member.joined_at,
                placed_at: member.placed_at,
                how: member.how,
              },
            ]
          : [],
      ),
    };
  }

  /** The participants in a group now, by user ID with their group's. */
  function placedMembers() {
    return data.groupMembers.flatMap(({ user_id, group_id }) =>
      group_id ? [{ user_id, group_id }] : [],
    );
  }

  /**
   * Gives a word to everyone in a group who has none (BAC-169), roughly as the Event Service
   * does: the word their group has fewest of, never the last one a group is missing while
   * there's another group, and on a tie the word fewest hold across the event.
   */
  function dealWords() {
    const words = data.phrase;
    if (!words) return;
    const placed = placedMembers();
    const holders = (place: number, groupId?: string) =>
      placed.filter(
        (member) =>
          data.phraseWords[member.user_id] === place &&
          (groupId === undefined || member.group_id === groupId),
      ).length;
    for (const { user_id, group_id } of placed) {
      if (data.phraseWords[user_id] !== undefined) continue;
      const places = words.map((_, place) => place);
      const held = places.filter((place) => holders(place, group_id) > 0);
      const keepOneBack = data.groups.length > 1 && data.connectAcross === "token_kinds";
      const oneShort = keepOneBack && held.length === places.length - 1;
      data.phraseWords[user_id] = (oneShort ? held : places).reduce((best, place) => {
        const [mine, bests] = [holders(place, group_id), holders(best, group_id)];
        return mine < bests || (mine === bests && holders(place) < holders(best)) ? place : best;
      });
    }
  }

  /**
   * The phrase as `user` sees it, with the word each of their connections gave, oldest first, or
   * null when they see none: no phrase is set, or they aren't in a group (BAC-169).
   */
  function phraseFor(user: MockUser) {
    const words = data.phrase;
    const yourWord = data.phraseWords[user.id];
    const placed = placedMembers().some((member) => member.user_id === user.id);
    if (!words || !placed || yourWord === undefined) return null;
    const have = new Set([yourWord]);
    const given = new Map<MockConnection, ConnectionWord | null>();
    for (const connection of (user.connections ?? []).toReversed()) {
      if (connection.gives_word === undefined) {
        given.set(connection, null);
        continue;
      }
      const place = connection.gives_word % words.length;
      given.set(connection, { text: words[place]!, already_had: have.has(place) });
      have.add(place);
    }
    return { words, yourWord, have, given };
  }

  function toGroupBoard(): GroupBoardResponse {
    return {
      allocation_started_at: data.groupAllocationStartedAt,
      connect_across: data.connectAcross,
      challenge: data.challenge,
      phrase: data.phrase && {
        text: data.phrase.join(" "),
        completed_count: data.users.filter(
          (user) => phraseFor(user)?.have.size === data.phrase?.length,
        ).length,
      },
      joined_count: data.groupMembers.length,
      groups: data.groups.map(toEventGroup),
      waiting: data.groupMembers
        .filter((member) => member.group_id === null)
        .map((member) => ({
          user_id: member.user_id,
          display_name: memberName(member.user_id),
          joined_at: member.joined_at,
        })),
    };
  }

  // The next person's group, by the spec's "Placement rules", as the Event Service chooses: the
  // one with the fewest members that has room, or the one with the fewest when all are full,
  // the oldest on a tie. None with no groups.
  function choosePlace(): MockGroup | undefined {
    const sizeOf = (groupId: string) =>
      data.groupMembers.filter((member) => member.group_id === groupId).length;
    const smallest = (groups: MockGroup[]) =>
      groups.reduce<MockGroup | undefined>(
        (best, group) => (!best || sizeOf(group.id) < sizeOf(best.id) ? group : best),
        undefined,
      );
    const withRoom = data.groups.filter(
      (group) => group.capacity === null || sizeOf(group.id) < group.capacity,
    );
    return smallest(withRoom) ?? smallest(data.groups);
  }

  /** `name_taken` when a group other than `ownId` has the name, whatever its capitals. */
  function refuseTakenName(name: string, ownId: string | null) {
    const taken = data.groups.some(
      (group) => group.id !== ownId && group.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) fail("name_taken");
  }

  /**
   * A group's fields as the Event Service checks them, trimmed, with a blank location as none,
   * or `validation_failed` at the first field past its limit.
   */
  function groupFields(input: CreateGroupRequest): Omit<MockGroup, "id"> {
    const name = input.name.trim();
    if (name === "" || !isGroupText(name)) {
      fail("validation_failed", [
        { path: ["name"], message: `name must be 1 to ${GROUP_TEXT_MAX} characters` },
      ]);
    }
    const tags = (input.tags ?? []).map((tag) => tag.trim());
    if (tags.length > GROUP_TAGS_MAX) {
      fail("validation_failed", [
        { path: ["tags"], message: `tags must have at most ${GROUP_TAGS_MAX} items` },
      ]);
    }
    const badTag = tags.findIndex((tag) => tag === "" || !isGroupText(tag));
    if (badTag >= 0) {
      fail("validation_failed", [
        { path: ["tags", badTag], message: `tag must be 1 to ${GROUP_TEXT_MAX} characters` },
      ]);
    }
    const location = input.location?.trim() || null;
    if (location !== null && !isGroupText(location)) {
      fail("validation_failed", [
        { path: ["location"], message: `location must be 0 to ${GROUP_TEXT_MAX} characters` },
      ]);
    }
    const capacity = input.capacity ?? null;
    if (capacity !== null && !(Number.isInteger(capacity) && capacity > 0)) {
      fail("validation_failed", [
        { path: ["capacity"], message: "capacity must be a whole number above 0, or null" },
      ]);
    }
    return { name, tags, location, capacity };
  }

  /** `too_few_participants` when fewer than 2 have joined for each of `groupCount` groups. */
  function refuseTooFew(groupCount: number) {
    const needed = 2 * groupCount - data.groupMembers.length;
    if (needed > 0) fail("too_few_participants", [], needed);
  }

  /** Everyone waiting, shuffled, each to the group choosePlace() gives, and allocation started. */
  function placeWaiting() {
    const placedAt = iso(Date.now());
    const waiting = data.groupMembers.filter((member) => member.group_id === null);
    for (const member of shuffled(waiting)) {
      const place = choosePlace()!;
      member.group_id = place.id;
      member.placed_at = placedAt;
      member.how = "allocated";
    }
    data.groupAllocationStartedAt ??= placedAt;
    dealWords();
  }

  /**
   * The split's fields as the Event Service checks them: exactly one of the two numbers, each a
   * whole number, 2 or more per group and 1 or more groups, and each location trimmed with a blank
   * one as none, or `validation_failed` at the first that breaks a rule.
   */
  function checkSplitRequest(input: SplitGroupsRequest) {
    const { people_per_group: peoplePerGroup, group_count: groupCount } = input;
    if ((peoplePerGroup === undefined) === (groupCount === undefined)) {
      fail("validation_failed", [
        { path: [], message: "send exactly one of people_per_group and group_count" },
      ]);
    }
    if (
      peoplePerGroup !== undefined &&
      !(Number.isInteger(peoplePerGroup) && peoplePerGroup >= PEOPLE_PER_GROUP_MIN)
    ) {
      fail("validation_failed", [
        {
          path: ["people_per_group"],
          message: `people_per_group must be ${PEOPLE_PER_GROUP_MIN} or more`,
        },
      ]);
    }
    if (
      groupCount !== undefined &&
      !(Number.isInteger(groupCount) && groupCount >= GROUP_COUNT_MIN)
    ) {
      fail("validation_failed", [
        { path: ["group_count"], message: `group_count must be ${GROUP_COUNT_MIN} or more` },
      ]);
    }
    const locations = (input.locations ?? []).map((location) => location?.trim() || null);
    const tooLong = locations.findIndex((location) => location !== null && !isGroupText(location));
    if (tooLong >= 0) {
      fail("validation_failed", [
        {
          path: ["locations", tooLong],
          message: `location must be 0 to ${GROUP_TEXT_MAX} characters`,
        },
      ]);
    }
    return { peoplePerGroup, groupCount, locations };
  }

  function toMyGroup(userId: string): MyGroupResponse {
    const allocation_started = data.groupAllocationStartedAt !== null;
    const mine = data.groupMembers.find((member) => member.user_id === userId);
    if (!mine) return { status: "not_joined", allocation_started, group: null };
    const group = data.groups.find(({ id }) => id === mine.group_id);
    if (!group) return { status: "waiting", allocation_started, group: null };
    const reached = reachedGroupIds(group.id);
    return {
      status: "placed",
      allocation_started,
      group: {
        id: group.id,
        name: group.name,
        tags: group.tags,
        location: group.location,
        members: data.groupMembers
          .filter((member) => member.group_id === group.id)
          .map((member) => ({ display_name: memberName(member.user_id) })),
        // Only groups with someone in them, as the Event Service lists them.
        other_groups: data.groups
          .filter(
            ({ id }) =>
              id !== group.id && data.groupMembers.some((member) => member.group_id === id),
          )
          .map(({ id, name }) => ({ name, reached: reached.includes(id) })),
      },
    };
  }

  function toAdminTap(tap: MockTap): AdminTap {
    const station = stationById(tap.station_id);
    const user = tap.user_id ? userById(tap.user_id) : undefined;
    return {
      id: tap.id,
      client_tap_id: tap.client_tap_id,
      station: { id: tap.station_id, name: station?.passport?.name ?? null },
      user: { id: tap.user_id, display_name: user?.display_name ?? null },
      status: tap.status,
      source: tap.source,
      tapped_at: tap.tapped_at,
      received_at: tap.received_at,
    };
  }

  /**
   * Agreement 9.10, drawing the same game 9.2 gives the board.
   */
  function toMapStation(station: MockStation): MapStation {
    const counted = countedTapsAt(station);
    const accepted = counted.filter((tap) => tap.status === "accepted");
    const newest = counted.map((tap) => tap.received_at).sort((a, b) => b.localeCompare(a))[0];
    return {
      station_id: station.id,
      game: gameOf(station),
      name: station.passport?.name ?? null,
      booth: station.booth,
      disabled: station.disabled_at !== null,
      taps: counted.length,
      unique_participants: new Set(accepted.map((tap) => tap.user_id)).size,
      last_tap_at: newest ?? null,
    };
  }

  const client: ApiClient = {
    me: () =>
      call((): MeResponse => {
        const user = currentUser();
        const mine = data.taps.filter((t) => t.user_id === user.id);
        const accepted = mine.filter((t) => t.status === "accepted");
        const stamps = stampSlots().map((passport) => {
          const first = accepted
            .filter((t) => t.station_id === passport.id)
            .sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
          return {
            station_id: passport.id,
            name: passport.name,
            location: passport.location,
            points: passport.points,
            link: passport.link,
            earned_at: first?.received_at ?? null,
          };
        });
        // With no phrase to see, /me has no `phrase` and no connection has a `word` (BAC-169).
        const phrase = phraseFor(user);
        const connections = (user.connections ?? []).map(
          ({ their_ms, gives_word: _gives, ...connection }, index): Connection => ({
            ...connection,
            ...(phrase && { word: phrase.given.get(user.connections![index]!) ?? null }),
            id: connection.id ?? null,
            dice: connection.dice ?? null,
            reaction: connection.reaction ? reactionNow(connection.reaction, their_ms) : null,
            shared:
              new Date(connection.shared_at).getTime() <= Date.now() ? connection.shared : null,
          }),
        );
        // 0.13: each connection adds 1 point, whatever its match. The answers game
        // keeps that at 1, and the mock has no setting of its own.
        const points = accepted.reduce(
          (sum, t) => sum + (stationById(t.station_id)?.passport?.points ?? 0),
          connections.length,
        );
        const recent_taps = [...mine]
          .sort((a, b) => b.id - a.id)
          .slice(0, 50)
          .map((t) => ({
            id: t.id,
            station_id: t.station_id,
            station_name: stationById(t.station_id)?.passport?.name ?? null,
            status: t.status,
            source: t.source,
            tapped_at: t.tapped_at,
            received_at: t.received_at,
          }));
        return {
          round: roundNow(),
          round_wins: round?.result?.outcome === "win" ? 1 : 0,
          user: toUser(user),
          questions: data.questions,
          points,
          stamps,
          recent_taps,
          connection_requests: (user.connection_requests ?? []).map(
            ({ id, display_name, bio, requested_at }) => ({ id, display_name, bio, requested_at }),
          ),
          connections,
          ...(phrase && {
            phrase: {
              words: phrase.words.map((word, place) => (phrase.have.has(place) ? word : null)),
              your_word: phrase.yourWord,
            },
          }),
        };
      }, false),

    // An unfinished pair keeps its request for a retry (agreement 8.10, BAC-144).
    // Every other accept takes it, and only `connected` makes a connection.
    acceptConnectionRequest: (requestId) =>
      call((): AcceptConnectionRequestResponse => {
        const user = currentUser();
        const waiting = user.connection_requests?.find(({ id }) => id === requestId);
        if (waiting?.accept_answer === "answers_needed") return { status: "answers_needed" };
        const request = takeConnectionRequest(user, requestId);
        const status = request.accept_answer ?? "connected";
        if (status === "connected") {
          const at = Date.now();
          const yourRoll = Math.floor(Math.random() * 6) + 1;
          const theirRoll = Math.floor(Math.random() * 6) + 1;
          const reaction = request.accept_game === "reaction";
          // The first word they don't have yet, so accepting moves the phrase on (BAC-169).
          const phrase = phraseFor(user);
          const missing = phrase?.words.findIndex((_, place) => !phrase.have.has(place)) ?? -1;
          user.connections = [
            {
              gives_word: Math.max(missing, 0),
              id: `c_${at.toString(36)}`,
              connected_at: new Date(at).toISOString(),
              display_name: request.display_name,
              bio: request.bio,
              contact_line: null,
              kind: "B",
              match: 40,
              dice: reaction
                ? null
                : {
                    your_roll: yourRoll,
                    their_roll: theirRoll,
                    result: yourRoll >= theirRoll ? "win" : "loss",
                  },
              // The other person plays at once, so the result comes when the user plays.
              ...(reaction && {
                reaction: {
                  play_by: new Date(at + REACTION_WINDOW_MS).toISOString(),
                  your_play: "not_played",
                  your_ms: null,
                  their_play: "not_played",
                  their_ms: null,
                  result: null,
                },
                their_ms: 287,
              }),
              shared: ["drink", "weekend"],
              shared_at: new Date(at + 120_000).toISOString(),
            },
            ...(user.connections ?? []),
          ];
        }
        return { status };
      }),

    declineConnectionRequest: (requestId) =>
      call(() => {
        takeConnectionRequest(currentUser(), requestId);
      }),

    // BAC-157, for the agreement's next version, 8.12. The mock has no Event Service key to sign
    // with, so it answers `mock`, the one link the GeekyKey screens' mock accepts.
    createGeekykeyLoginLink: () =>
      call((): GeekykeyLoginLinkResponse => {
        currentUser();
        return { login_link: "mock", expires_at: new Date(Date.now() + 60_000).toISOString() };
      }),

    // BAC-156, for the agreement's next version, 8.11.
    playDuelReaction: (id, play) =>
      call(() => {
        currentUser();
        roundNow();
        const duel = round?.duels.find((duel) => duel.id === id);
        if (!duel?.reaction) fail("not_found");
        const reaction = duel.reaction;
        if (reaction.your_play === "missed") fail("too_late");
        if (reaction.your_play !== "not_played") fail("already_played");
        const ms = "ms" in play ? play.ms : null;
        if (ms !== null && (!Number.isInteger(ms) || ms < 1 || ms > 120_000))
          fail("validation_failed");
        duel.reaction = reactionNow(
          { ...reaction, your_play: ms === null ? "early" : "played", your_ms: ms },
          scenario === "timeout" ? undefined : 350,
        );
        return { reaction: structuredClone(duel.reaction) };
      }),
    setStationGame: (id, game) =>
      call(() => {
        currentOrganizer();
        const station = stationById(id);
        if (!station) fail("not_found");
        // 9.11: one of 9.2's games, or none.
        if (game !== null && !STATION_GAMES.some((one) => one.id === game))
          fail("validation_failed");
        station.game = game;
        return { station: toStationBoardStation(station) };
      }),
    playReaction: (connectionId, play) =>
      call((): PlayReactionResponse => {
        const user = currentUser();
        const connection = user.connections?.find(({ id }) => id === connectionId);
        if (!connection?.reaction) fail("not_found");
        const ms = "ms" in play ? play.ms : null;
        if (ms !== null && (!Number.isInteger(ms) || ms < 1 || ms > REACTION_WINDOW_MS)) {
          fail("validation_failed", [{ path: ["ms"], message: "ms must be from 1 to 120000" }]);
        }
        const now = reactionNow(connection.reaction, connection.their_ms);
        if (now.your_play === "played" || now.your_play === "early") fail("already_played");
        if (now.your_play === "missed") fail("too_late");
        connection.reaction = {
          ...connection.reaction,
          your_play: ms === null ? "early" : "played",
          your_ms: ms,
        };
        return { reaction: reactionNow(connection.reaction, connection.their_ms) };
      }),

    // Agreement 8.7. The name is trimmed and 1 to 30 code points, `answers` sets only the
    // questions it names, and blank or null clears the bio or the contact line. A request that
    // breaks any rule, or whose name someone else has, changes nothing.
    updateMe: (input: UpdateMeRequest) =>
      call((): UpdateMeResponse => {
        const user = currentUser();
        const issues: ApiIssue[] = [];
        const name = input.display_name?.trim();
        const bio = input.bio?.trim();
        const contactLine = input.contact_line?.trim();

        // 8.7: a request needs at least one field. The service's schema refuses an empty body
        // before the handler runs.
        if (Object.values(input).every((field) => field === undefined)) {
          fail("validation_failed", [
            {
              path: [],
              message:
                "A request needs at least one of display_name, answers, bio and contact_line",
            },
          ]);
        }

        if (bio && !fitsLimit(bio, BIO_MAX)) {
          issues.push({ path: ["bio"], message: `bio must be at most ${BIO_MAX} characters` });
        }
        if (contactLine && !fitsLimit(contactLine, CONTACT_LINE_MAX)) {
          issues.push({
            path: ["contact_line"],
            message: `contact_line must be at most ${CONTACT_LINE_MAX} characters`,
          });
        }

        if (name !== undefined && !isDisplayName(name)) {
          issues.push({
            path: ["display_name"],
            message: "display_name must be 1 to 30 characters",
          });
        }

        if (input.answers !== undefined) {
          // 0.13: an unknown question or choice is refused under its question's ID.
          const choicesOf = new Map(
            (data.questions ?? []).map((question) => [
              question.id,
              new Set(question.choices.map((choice) => choice.id)),
            ]),
          );
          for (const [questionId, choiceId] of Object.entries(input.answers)) {
            const choices = choicesOf.get(questionId);
            if (!choices) {
              issues.push({ path: ["answers", questionId], message: "No question has this ID" });
            } else if (!choices.has(choiceId)) {
              issues.push({
                path: ["answers", questionId],
                message: "The question has no choice with this ID",
              });
            }
          }
        }

        if (issues.length) fail("validation_failed", issues);

        // The first connection fixes existing answers. BAC-144 lets older incomplete
        // answers be filled, while an empty map or an existing question still gets 409.
        if (
          input.answers !== undefined &&
          (user.connections?.length ?? 0) > 0 &&
          (Object.keys(input.answers).length === 0 ||
            Object.keys(input.answers).some((id) => Object.hasOwn(user.answers ?? {}, id)))
        ) {
          fail("answers_fixed");
        }

        if (name !== undefined) {
          // BAC-145: nobody chose the default name, and a name of your own can be saved again.
          const sameNamed = data.users.filter(
            (other) =>
              other.has_name && other.display_name?.trim().toLowerCase() === name.toLowerCase(),
          );
          if (sameNamed.length > 0 && !sameNamed.includes(user)) fail("name_taken");
          user.display_name = name;
          user.has_name = true;
        }
        if (input.answers !== undefined) {
          user.answers = { ...user.answers, ...input.answers };
        }
        if (input.bio !== undefined) user.bio = bio || null;
        if (input.contact_line !== undefined) user.contact_line = contactLine || null;
        return { user: toUser(user) };
      }),

    devLogin: (userId) =>
      call(() => {
        if (!userById(userId)) fail("not_found");
        setSession(userId);
      }),

    // The mock has no Firebase to ask, so the sign-in picks the seeded participant. The
    // screens read GET /api/v1/me afterwards, as they do live.
    firebaseLogin: () =>
      call(() => {
        setSession(SEEDED_PARTICIPANT_ID);
      }),

    // The mock has no GeekyKey Service to make a real link, so MOCK_LOGIN_LINKS stand in
    // for them. Any other link has expired, and the session stays as it was, as it does live.
    loginLink: (link) =>
      call(() => {
        const userId = Object.hasOwn(MOCK_LOGIN_LINKS, link) ? MOCK_LOGIN_LINKS[link] : undefined;
        if (userId === undefined) fail("invalid_login_link");
        setSession(userId);
      }),

    logout: () =>
      call(() => {
        setSession(null);
      }),

    listStationBoard: () =>
      call((): EventStationBoardResponse => {
        currentOrganizer();
        return {
          stations: data.stations.map(toStationBoardStation),
          // A copy, so a caller that sorts or edits the list can't change the next answer.
          games: STATION_GAMES.map((game) => ({ ...game })),
        };
      }),

    // Agreement 9.7. The label is the device's name and the only field, so a new
    // station has no passport settings yet and reads as "Not in the passport".
    createStation: (input: CreateStationRequest) =>
      call((): StationKeyResponse => {
        currentOrganizer();
        const issues: ApiIssue[] = [];
        const label = input.label.trim();
        if (label.length < 1 || label.length > 80)
          issues.push({ path: ["label"], message: "label must be 1 to 80 characters" });
        if (issues.length) fail("validation_failed", issues);
        const station: MockStation = {
          id: crypto.randomUUID(),
          label,
          created_at: iso(now()),
          disabled_at: null,
          passport: null,
          booth: null,
          last_seen_at: null,
          simulate_online: false,
          firmware_version: null,
          buffered_taps: 0,
          reader_ok: null,
        };
        data.stations.push(station);
        return { station: toStationBoardStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    replaceStationKey: (stationId) =>
      call((): StationKeyResponse => {
        currentOrganizer();
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");

        // 9.8 replaces the key and nothing else, so this deliberately does not touch the
        // station: its id, its passport settings and their added_at, its disabled_at and its
        // last tap all stay as they are. Replacing a disabled station's key is therefore
        // defined, and does not enable it, which the spec's disable-then-replace path needs.
        return { station: toStationBoardStation(station), api_key: `gk_sta_${randomBase62(40)}` };
      }),

    // Agreement 9.9. Disabling sets disabled_at and touches nothing else: the station keeps
    // its taps, and by 9.2 its stamp slot and stamps; enabling clears disabled_at so the
    // saved taps count once they arrive. Doing either twice changes nothing, so a
    // re-disable keeps the original disabled_at. The key getting 401 within a minute is
    // the GeekyKey Service's copy refreshing, which no client here sees or computes.
    disableStation: (stationId) =>
      call((): StationResponse => {
        currentOrganizer();
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");
        // The "twice changes nothing" half of 9.9: a re-disable keeps the original
        // disabled_at rather than moving it.
        if (station.disabled_at === null) station.disabled_at = iso(now());
        return { station: toStationBoardStation(station) };
      }),

    enableStation: (stationId) =>
      call((): StationResponse => {
        currentOrganizer();
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");
        station.disabled_at = null;
        return { station: toStationBoardStation(station) };
      }),

    // Agreement 9.12. The booth is free text for the map's floor plan, kept as typed once
    // trimmed, and a blank one is none. 9.12 counts it in code points, as 9.1 does, and its
    // message is the service's own. The body is checked before the station is looked up,
    // because the service's validator runs before the handler that answers not_found.
    setStationBooth: (stationId, input) =>
      call((): StationResponse => {
        currentOrganizer();
        if (!isBooth(input.booth)) {
          fail("validation_failed", [
            { path: ["booth"], message: `booth must be 0 to ${BOOTH_MAX} characters` },
          ]);
        }
        const station = stationById(stationId);
        if (!station) throw new ApiError(404, "not_found");
        station.booth = input.booth.trim() || null;
        return { station: toStationBoardStation(station) };
      }),

    setStationPassport: (stationId, input) =>
      call((): SetStationPassportResponse => {
        currentOrganizer();
        const station = data.stations.find((s) => s.id === stationId);
        if (!station) throw new ApiError(404, "not_found");

        const issues: ApiIssue[] = [];
        const name = input.name.trim();
        if (name.length < 1 || name.length > 80) {
          issues.push({ path: ["name"], message: "name must be 1 to 80 characters" });
        }
        const points = input.points ?? 1;
        if (!Number.isInteger(points) || points < 0) {
          issues.push({ path: ["points"], message: "points must be an integer of 0 or more" });
        }
        const location = input.location?.trim();
        if (location !== undefined && location.length > 80) {
          issues.push({ path: ["location"], message: "location must be 80 characters or fewer" });
        }
        const link = input.link?.trim();
        if (link && !isGroupLink(link)) {
          issues.push({
            path: ["link"],
            message: "link must start with https:// and be at most 300 characters",
          });
        }
        if (issues.length) fail("validation_failed", issues);

        // added_at decides the passport's slot order (agreement 8.1), so changing settings
        // must keep the original one or the station would move. The service answers 201 when
        // it adds and 200 when it changes; the body is the same either way.
        const addedAt = station.passport === null ? iso(now()) : station.passport.added_at;
        station.passport = {
          name,
          location: location || null,
          points,
          link: link || null,
          added_at: addedAt,
        };
        return { passport: { station_id: station.id, ...station.passport } };
      }),

    listTaps: (query: ListTapsQuery = {}) =>
      call((): ListTapsResponse => {
        currentOrganizer();
        const limit = Math.min(200, Math.max(1, query.limit ?? 50));
        const matching = data.taps
          .filter((t) => (query.station_id ? t.station_id === query.station_id : true))
          .filter((t) => (query.status ? t.status === query.status : true))
          .filter((t) => (query.before_id !== undefined ? t.id < query.before_id : true))
          .sort((a, b) => b.id - a.id);
        const page = matching.slice(0, limit);
        const last = page[page.length - 1];
        return {
          taps: page.map(toAdminTap),
          next_before_id: last && matching.length > page.length ? last.id : null,
        };
      }),

    createFallbackTap: (input: FallbackTapRequest) =>
      call((): FallbackTapResponse => {
        currentOrganizer();
        const station = stationById(input.station_id);
        if (!station?.passport) fail("not_found");
        const at = now();
        const userId = input.user_id.trim();
        if (!userId) {
          fail("validation_failed", [
            { path: ["user_id"], message: "Enter the participant's user ID." },
          ]);
        }
        // A user ID is valid even when the participant has never logged in.
        const status = resolveStatus(userId, input.station_id, at);
        if (status === "no_game") fail("not_found");
        const tap = appendTap({
          station_id: input.station_id,
          client_tap_id: crypto.randomUUID(),
          user_id: userId,
          source: "qr_fallback",
          status,
          tapped_at: null,
          received_at: iso(at),
        });
        const resultStatus: FallbackTapStatus = status === "cooldown" ? "cooldown" : "accepted";
        return { result: { id: tap.id, status: resultStatus } };
      }),

    stats: () =>
      call((): StatsResponse => {
        currentOrganizer();
        const accepted = data.taps.filter((t) => t.status === "accepted");
        const unique = (taps: MockTap[]) =>
          new Set(taps.map((t) => t.user_id).filter(Boolean)).size;
        return {
          total_taps: data.taps.length,
          accepted_taps: accepted.length,
          unique_participants: unique(accepted),
          // Taps at a station outside the passport still count in the totals (agreement 9.5).
          stations: stampSlots().map((slot) => {
            const here = accepted.filter((t) => t.station_id === slot.id);
            return {
              station_id: slot.id,
              name: slot.name,
              accepted_taps: here.length,
              unique_participants: unique(here),
            };
          }),
        };
      }),

    exportCsv: () =>
      call(() => {
        currentOrganizer();
        const rows = [...data.taps]
          .sort((a, b) => a.id - b.id)
          .map((tap) => {
            const user = tap.user_id ? userById(tap.user_id) : undefined;
            return [
              String(tap.id),
              tap.client_tap_id,
              tap.station_id,
              stationById(tap.station_id)?.passport?.name ?? "",
              tap.user_id,
              user?.display_name ?? "",
              tap.status,
              tap.source,
              tap.tapped_at ?? "",
              tap.received_at,
            ];
          });
        return csvFile(EXPORT_CSV_COLUMNS, rows);
      }),

    // Agreement 9.10. The mock keeps no map screen list, so only an organizer may read it.
    // Stamp slots come first in slot order, then the other stations, oldest first.
    map: () =>
      call((): MapResponse => {
        currentOrganizer();
        const shown = Math.min(MAP_LINKS_AT_FIRST_READ + mapReads, MAP_CONNECTIONS.length);
        mapReads += 1;
        const links = MAP_CONNECTIONS.slice(0, shown);
        const slots = data.stations
          .filter((station) => station.passport)
          .sort((a, b) => (a.passport?.added_at ?? "").localeCompare(b.passport?.added_at ?? ""));
        const others = data.stations
          .filter((station) => !station.passport)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return {
          stations: [...slots, ...others].map(toMapStation),
          connections: { count: links.length, links },
        };
      }),
    // The groups, from the spec's draft for agreement 0.14.
    myGroup: () => call(() => toMyGroup(currentUser().id)),

    joinGroups: () =>
      call(() => {
        const user = currentUser();
        if (user.role === "organizer") fail("forbidden");
        if (!data.groupMembers.some((member) => member.user_id === user.id)) {
          // After Allocate, a latecomer is placed as they join, or waits with no groups.
          const place = data.groupAllocationStartedAt === null ? undefined : choosePlace();
          const joinedAt = iso(Date.now());
          data.groupMembers.push({
            user_id: user.id,
            group_id: place?.id ?? null,
            joined_at: joinedAt,
            placed_at: place ? joinedAt : null,
            how: place ? "latecomer" : null,
          });
          dealWords();
        }
        return toMyGroup(user.id);
      }),

    groupBoard: () =>
      call(() => {
        currentOrganizer();
        return toGroupBoard();
      }),

    createGroup: (input: CreateGroupRequest) =>
      call(() => {
        currentOrganizer();
        const fields = groupFields(input);
        refuseTakenName(fields.name, null);
        const group: MockGroup = { id: `g_${randomBase62(8)}`, ...fields };
        data.groups.push(group);
        return toEventGroup(group);
      }),

    updateGroup: (groupId: string, input: UpdateGroupRequest) =>
      call(() => {
        currentOrganizer();
        // validation_failed, then not_found, then name_taken, in the Event Service's order.
        const fields = groupFields(input);
        const group = data.groups.find(({ id }) => id === groupId);
        if (!group) fail("not_found");
        refuseTakenName(fields.name, groupId);
        // Moves nobody, even when the capacity drops below the group's size.
        Object.assign(group, fields);
        return toEventGroup(group);
      }),

    deleteGroup: (groupId: string) =>
      call(() => {
        currentOrganizer();
        if (!data.groups.some(({ id }) => id === groupId)) fail("not_found");
        data.groups = data.groups.filter(({ id }) => id !== groupId);
        for (const member of data.groupMembers) {
          if (member.group_id !== groupId) continue;
          member.group_id = null;
          member.placed_at = null;
          member.how = null;
        }
      }),

    // An organizer's choice overrules a capacity. Someone who hasn't joined joins now.
    placeGroupMember: (userId: string, groupId: string | null) =>
      call(() => {
        currentOrganizer();
        const user = userById(userId);
        if (user?.role === "organizer") fail("forbidden");
        if (!user) fail("not_found");
        if (groupId !== null && !data.groups.some(({ id }) => id === groupId)) fail("not_found");
        const at = iso(Date.now());
        let member = data.groupMembers.find((candidate) => candidate.user_id === userId);
        if (!member) {
          member = { user_id: userId, group_id: null, joined_at: at, placed_at: null, how: null };
          data.groupMembers.push(member);
        }
        if (member.group_id !== groupId) {
          member.group_id = groupId;
          member.placed_at = groupId === null ? null : at;
          member.how = groupId === null ? null : "organizer";
        }
        dealWords();
        return toGroupBoard();
      }),

    removeGroupMember: (userId: string) =>
      call(() => {
        currentOrganizer();
        if (!data.groupMembers.some((member) => member.user_id === userId)) fail("not_found");
        data.groupMembers = data.groupMembers.filter((member) => member.user_id !== userId);
      }),

    // Everyone waiting, shuffled, each to the group choosePlace() gives. It refuses with no
    // groups, or fewer than 2 joined for each, as the Event Service does.
    allocateGroups: () =>
      call(() => {
        currentOrganizer();
        if (data.groups.length === 0) fail("no_groups");
        refuseTooFew(data.groups.length);
        placeWaiting();
        return toGroupBoard();
      }),

    // Makes "Group 1", "Group 2" and so on, in place of any groups with nobody in them, then
    // allocates as above, or makes nothing. It refuses with anyone placed, then with fewer than 2
    // joined for each group, as the Event Service does.
    splitGroups: (input: SplitGroupsRequest) =>
      call(() => {
        currentOrganizer();
        const { peoplePerGroup, groupCount, locations } = checkSplitRequest(input);
        if (data.groupMembers.some((member) => member.group_id !== null)) fail("groups_exist");
        const count =
          peoplePerGroup === undefined
            ? groupCount!
            : splitGroupCount(data.groupMembers.length, peoplePerGroup);
        refuseTooFew(Math.max(count, 1));
        data.groups = Array.from({ length: count }, (_, i) => ({
          id: `g_${randomBase62(8)}`,
          name: `Group ${i + 1}`,
          tags: [],
          location: locations[i] ?? null,
          capacity: peoplePerGroup ?? null,
        }));
        placeWaiting();
        return toGroupBoard();
      }),

    // Each tap after this is judged by the new setting, and connections already made stay.
    setConnectionRule: (input: ConnectionRule) =>
      call(() => {
        currentOrganizer();
        if (!CONNECT_ACROSS.includes(input.connect_across)) {
          fail("validation_failed", [
            { path: ["connect_across"], message: "connect_across must be token_kinds or groups" },
          ]);
        }
        data.connectAcross = input.connect_across;
        return { connect_across: data.connectAcross };
      }),

    // Each connection made after this plays what the setting says, and those already made keep theirs.
    setConnectionChallenge: (input: ConnectionChallenge) =>
      call(() => {
        currentOrganizer();
        if (!CHALLENGES.includes(input.challenge)) {
          fail("validation_failed", [
            { path: ["challenge"], message: "challenge must be random, dice or reaction" },
          ]);
        }
        data.challenge = input.challenge;
        return { challenge: data.challenge };
      }),

    // BAC-169, draft for the agreement's next version. A phrase that differs from the one set
    // deals every word again, and the same one changes nothing.
    setPhrase: (input: SetPhraseRequest) =>
      call(() => {
        currentOrganizer();
        const words = phraseWords(input.phrase ?? "");
        const problem = phraseProblem(words);
        if (problem) fail("validation_failed", [{ path: ["phrase"], message: problem }]);
        const next = words.length === 0 ? null : words;
        if (next?.join(" ") !== data.phrase?.join(" ")) {
          data.phrase = next;
          data.phraseWords = {};
          dealWords();
        }
        return toGroupBoard();
      }),

    // Everyone has to join again and allocation hasn't started, as before the first trial. The
    // groups stay.
    resetGroups: () =>
      call(() => {
        currentOrganizer();
        data.groupMembers = [];
        data.groupAllocationStartedAt = null;
        // Every word is taken back, and dealt again as people are placed (BAC-169).
        data.phraseWords = {};
        return toGroupBoard();
      }),

    // Everyone who has joined, oldest join first, as the Event Service writes it.
    exportGroupsCsv: () =>
      call(() => {
        currentOrganizer();
        const rows = data.groupMembers
          .toSorted(
            (a, b) => a.joined_at.localeCompare(b.joined_at) || a.user_id.localeCompare(b.user_id),
          )
          .map((member) => [
            member.user_id,
            memberName(member.user_id),
            data.groups.find((group) => group.id === member.group_id)?.name ?? "",
            member.joined_at,
            member.placed_at ?? "",
            member.how ?? "",
          ]);
        return csvFile(GROUPS_EXPORT_CSV_COLUMNS, rows);
      }),
  };

  // Station simulator: keeps online stations fresh and drips in new taps so polling has something to show.
  let timer: ReturnType<typeof setInterval> | null = null;
  if (options.simulate) {
    timer = setInterval(() => {
      const at = now();
      for (const station of data.stations) {
        if (station.simulate_online) station.last_seen_at = iso(at);
      }
      if (Math.random() < 0.65) {
        const online = data.stations.filter((s) => s.simulate_online);
        const participants = data.users.filter((u) => u.role === "participant");
        const station = online[Math.floor(Math.random() * online.length)];
        const participant = participants[Math.floor(Math.random() * participants.length)];
        if (!station || !participant) return;
        appendTap({
          station_id: station.id,
          client_tap_id: `tap-${String(nextTapId + 100_000).padStart(6, "0")}`,
          user_id: participant.id,
          source: "nfc",
          status: resolveStatus(participant.id, station.id, at),
          tapped_at: iso(at - 700),
          received_at: iso(at),
        });
      }
    }, 7_000);
  }

  return {
    ...client,
    mock: {
      failNext: (failure) => {
        pendingFailure = failure;
      },
      setSession,
      data,
      stop: () => {
        if (timer) clearInterval(timer);
        timer = null;
      },
    },
  };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180, as agreement 9.6 has it: every line ends in CRLF, the last one too. */
function csvFile(columns: readonly string[], rows: string[][]): Blob {
  const lines = [columns.join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
}

/** A copy of `items` in a random order (Fisher-Yates), as Allocate places the waiting list. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function randomBase62(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}
