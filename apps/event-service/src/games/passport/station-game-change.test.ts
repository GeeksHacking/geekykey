import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import { teamDuelsGame } from "../team-duels/team-duels.ts";
import {
  fakeClock,
  screensSchemas,
  setupFixture,
  TEST_EVENT_SERVICE_KEY,
  testApp,
  testDb,
} from "../../test-helpers.ts";
import { passportStations, users } from "../../event/schema.ts";

// A station's game changes at any time (BAC-183, agreement 0.14),
// since each tap records the game that counted it or held it back. Through the routes a client
// calls: the hand-off (11.2), the game's change (9.11) and the participant's /me (8.1).

const ORGANIZER = "organizer";

async function harness() {
  const fixture = await setupFixture();
  // Worth 5, so a tap that earned station points shows in the total.
  await testDb()
    .update(passportStations)
    .set({ points: 5 })
    .where(eq(passportStations.stationId, fixture.stationId));
  await testDb().insert(users).values({ id: ORGANIZER, displayName: "Olive" });
  const clock = fakeClock("2026-11-12T08:00:00.000Z");
  const app = testApp(
    { ORGANIZERS: ORGANIZER },
    { now: clock.now, teamDuels: teamDuelsGame({ rollDie: () => 3, pickGame: () => "dice" }) },
  );

  const cookies = new Map<string, string>();
  const cookie = async (userId: string) => {
    if (!cookies.has(userId)) {
      const res = await app.request("/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      assert.equal(res.status, 204);
      cookies.set(userId, res.headers.get("Set-Cookie")!.split(";")[0]!);
    }
    return cookies.get(userId)!;
  };

  /** One tap by the fixture's participant at the station, now, and its status. */
  const tap = async (): Promise<string> => {
    const res = await app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: fixture.stationId,
        taps: [{ client_tap_id: crypto.randomUUID(), user_id: fixture.userId, tapped_at: null }],
      }),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { results: { status: string }[] }).results[0]!.status;
  };

  /** Sets the station's game as an organizer (9.11), and gives the answer. */
  const setGame = async (game: string | null) =>
    app.request(`/api/v1/admin/stations/${fixture.stationId}/game`, {
      method: "PUT",
      headers: { Cookie: await cookie(ORGANIZER), "Content-Type": "application/json" },
      body: JSON.stringify({ game }),
    });

  /** The participant's points and earned stamps, from /me. */
  const passport = async () => {
    const res = await app.request("/api/v1/me", {
      headers: { Cookie: await cookie(fixture.userId) },
    });
    assert.equal(res.status, 200);
    const body: unknown = await res.json();
    screensSchemas.meResponseSchema.parse(body);
    const me = body as { points: number; stamps: { earned_at: string | null }[] };
    return { points: me.points, earnedAt: me.stamps.map((stamp) => stamp.earned_at) };
  };

  return { clock, tap, setGame, passport, cookie };
}

test("a station with passport taps changes to another game, and 9.11 answers 200", async () => {
  const h = await harness();
  assert.equal(await h.tap(), "accepted");

  const res = await h.setGame("team_duels");
  assert.equal(res.status, 200);
  const body: unknown = await res.json();
  screensSchemas.stationResponseSchema.parse(body);
  const { station } = body as { station: { game: string | null; game_fixed: boolean } };
  assert.deepEqual([station.game, station.game_fixed], ["team_duels", false]);
});

test("a tap another game counts at a passport station earns no stamp and no station points", async () => {
  const h = await harness();
  await h.setGame("team_duels");
  // Past the cooldown, so only the game decides the tap.
  h.clock.advanceSeconds(600);
  assert.equal(await h.tap(), "accepted");

  // A station that runs another game isn't a stamp slot.
  assert.deepEqual(await h.passport(), { points: 0, earnedAt: [] });
  // Back on the passport, the team duels tap still isn't a stamp.
  await h.setGame("passport");
  assert.deepEqual(await h.passport(), { points: 0, earnedAt: [null] });
});

test("a station set back to the passport shows the stamps it had before", async () => {
  const h = await harness();
  assert.equal(await h.tap(), "accepted");
  const before = await h.passport();
  assert.deepEqual(before, { points: 5, earnedAt: ["2026-11-12T08:00:00.000Z"] });

  await h.setGame("team_duels");
  h.clock.advanceSeconds(600);
  assert.equal(await h.tap(), "accepted");
  await h.setGame(null);
  await h.setGame("passport");

  assert.deepEqual(await h.passport(), before);
});

test("a tap another game counted doesn't put the passport's next tap in the cooldown", async () => {
  const h = await harness();
  await h.setGame("team_duels");
  assert.equal(await h.tap(), "accepted");

  // Well inside the passport's 5-minute cooldown.
  h.clock.advanceSeconds(10);
  await h.setGame("passport");
  assert.equal(await h.tap(), "accepted");
  // The passport's own tap still holds back the next one.
  h.clock.advanceSeconds(10);
  assert.equal(await h.tap(), "cooldown");
  assert.deepEqual(await h.passport(), { points: 5, earnedAt: ["2026-11-12T08:00:10.000Z"] });
});
