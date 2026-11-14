/**
 * A row in every table the clear's lists name, as after a real session. The
 * clear's tests and the copy tests use it. A table added to a list needs a row
 * here too, or neither proves anything about it.
 */
import { tokenKinds } from "../src/claims-stand-in/schema.ts";
import {
  eventSettings,
  groupAllocation,
  groupMembers,
  participantGroups,
  phraseWords,
  taps,
  usedLoginLinks,
  userKinds,
} from "../src/event/schema.ts";
import { answers, connections, meetingHalves } from "../src/games/connections/schema.ts";
import { setupFixture } from "../src/test-helpers.ts";

import { duelRounds, duelRoundPlayers, duels } from "../src/games/team-duels/schema.ts";

import { relayGames, relayLock, relayTransfers } from "../src/games/relay/schema.ts";
import { openSeatLock, openSeats } from "../src/games/open-seat/schema.ts";

const AT = "2026-11-12T12:00:00.000Z";

export async function fillEveryTable() {
  const fixture = await setupFixture();
  const { db, stationId, userId } = fixture;
  const other = "user-2";
  await db.insert(taps).values({
    stationId,
    clientTapId: "tap-1",
    userId,
    status: "accepted",
    game: "passport",
    receivedAt: AT,
  });
  await db.insert(userKinds).values({ userId, kind: "E" });
  await db.insert(answers).values({ userId, choices: { q1: "a" } });
  await db.insert(meetingHalves).values({ userA: userId, userB: other, aMetAt: AT });
  await db.insert(connections).values({
    userA: userId,
    userB: other,
    connectedAt: AT,
    shared: ["q1"],
  });
  await db.insert(participantGroups).values({
    id: "group-1",
    name: "Group 1",
    tags: [],
    createdAt: AT,
  });
  await db.insert(groupMembers).values({ userId, groupId: "group-1", joinedAt: AT });
  await db.insert(groupAllocation).values({ id: 1, startedAt: AT });
  await db.insert(tokenKinds).values({ uid: "04A1B2C3D4E5F6", kind: "E" });
  await db.insert(usedLoginLinks).values({ jti: "a".repeat(32), expiresAt: AT });
  await db.insert(phraseWords).values({ userId, position: 1 });
  await db
    .insert(eventSettings)
    .values({ id: 1, connectAcross: "groups", phrase: "Strangers become friends" });
  const roundId = crypto.randomUUID();
  await db.insert(duelRounds).values({ id: roundId, stationId, openedAt: AT, closesAt: AT });
  await db.insert(duelRoundPlayers).values({ roundId, userId, joinedAt: AT });
  await db.insert(duels).values({ id: crypto.randomUUID(), roundId, userA: userId, userB: other });
  const gameId = crypto.randomUUID();
  await db.insert(relayLock).values({ id: 1 });
  await db.insert(relayGames).values({
    id: gameId,
    startedAt: AT,
    stationA: stationId,
    stationB: "station-2",
    groupsPlaying: 2,
    transfersNeeded: 3,
    lastMovedAt: AT,
    lastTapAt: AT,
  });
  await db.insert(relayTransfers).values({
    id: crypto.randomUUID(),
    gameId,
    fromStationId: stationId,
    toStationId: "station-2",
    fromGroupId: "group-1",
    toGroupId: "group-2",
    calledAt: AT,
    closesAt: AT,
  });
  await db.insert(openSeatLock).values({ id: 1 });
  await db.insert(openSeats).values({
    id: crypto.randomUUID(),
    stationId,
    sitterId: userId,
    openedAt: AT,
    closesAt: AT,
    takerId: other,
    takenAt: AT,
    prompt: ["What are you", "building?"],
  });
  return fixture;
}
