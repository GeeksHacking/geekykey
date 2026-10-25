import assert from "node:assert/strict";
import { test } from "vitest";
import { setupFixture } from "../test-helpers.ts";
import type { Game, GameStatus } from "./games.ts";
import { stations } from "./schema.ts";
import { TapPipeline } from "./tap-pipeline.ts";

/** A game that gives each tap the status its client_tap_id is listed under, and no_game otherwise. */
function fixedGame(statuses: Record<string, GameStatus>): Game {
  return {
    name: "fixed",
    judge: async (taps) => taps.map((tap) => statuses[tap.clientTapId] ?? "no_game"),
  };
}

test("a tap is accepted if any game counted it, else cooldown if one held it back, else no_game", async () => {
  const { db, stationId, userId } = await setupFixture();
  const pipeline = new TapPipeline(db, {
    cooldownSeconds: 300,
    games: [
      { game: fixedGame({ both: "accepted", held: "cooldown" }), stations: "all" },
      { game: fixedGame({ both: "cooldown", one: "accepted" }), stations: "all" },
    ],
  });
  const results = await pipeline.ingest(
    stationId,
    ["both", "one", "held", "none"].map((clientTapId) => ({ clientTapId, userId })),
  );
  assert.deepEqual(
    results.map((r) => [r.clientTapId, r.status]),
    [
      ["both", "accepted"],
      ["one", "accepted"],
      ["held", "cooldown"],
      ["none", "no_game"],
    ],
  );
});

test("a game judges only the taps at the stations the settings give it", async () => {
  const { db, stationId, userId } = await setupFixture();
  await db.insert(stations).values({ id: "station-2", label: "Reader 2", apiKeyHash: "hash-2" });
  const pipeline = new TapPipeline(db, {
    cooldownSeconds: 300,
    games: [{ game: fixedGame({ t1: "accepted" }), stations: ["station-2"] }],
  });
  const [atOne] = await pipeline.ingest(stationId, [{ clientTapId: "t1", userId }]);
  const [atTwo] = await pipeline.ingest("station-2", [{ clientTapId: "t1", userId }]);
  assert.equal(atOne!.status, "no_game");
  assert.equal(atTwo!.status, "accepted");
});

test("a station no game runs on stores its taps as no_game", async () => {
  const { db, stationId, userId } = await setupFixture();
  const pipeline = new TapPipeline(db, { cooldownSeconds: 300, games: [] });
  const [result] = await pipeline.ingest(stationId, [{ clientTapId: "t1", userId }]);
  assert.equal(result!.status, "no_game");
});
