import { expect, it, vi } from "vitest";
import { createMockClient } from "@/api/mock/client";
import { ROUND_SCENARIOS, scoreReactions } from "@/api/mock/duel-round";
import { parseMeResponse } from "@/api/schemas";

it.each(ROUND_SCENARIOS)("serves a valid %s round", async (scenario) => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: scenario });
  api.mock.setSession("dev-user-1");
  expect(parseMeResponse(await api.me()).round).toBeTruthy();
});

it("walks from opening through play to a result, keeping wins separate from connections", async () => {
  vi.useFakeTimers();
  try {
    const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: "live" });
    api.mock.setSession("dev-user-1");
    const before = await api.me();
    expect(before.round?.state).toBe("opening");
    vi.advanceTimersByTime(30_000);
    expect((await api.me()).round?.state).toBe("playing");
    await api.playDuelReaction("20000000-0000-4000-8000-000000000000", { ms: 200 });
    await expect(
      api.playDuelReaction("20000000-0000-4000-8000-000000000000", { ms: 100 }),
    ).rejects.toMatchObject({ code: "already_played" });
    const after = await api.me();
    expect(after.round?.state).toBe("ended");
    expect(after.round_wins).toBe(1);
    expect(after.connections).toEqual(before.connections);
  } finally {
    vi.useRealTimers();
  }
});

it("expires unplayed reactions and refuses late or unknown plays", async () => {
  vi.useFakeTimers();
  try {
    const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: "playing" });
    api.mock.setSession("dev-user-1");
    await expect(api.playDuelReaction("unknown", { ms: 200 })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      api.playDuelReaction("20000000-0000-4000-8000-000000000000", { ms: 0 }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    vi.advanceTimersByTime(120_000);
    expect((await api.me()).round?.duels[0]?.reaction?.your_play).toBe("missed");
    await expect(
      api.playDuelReaction("20000000-0000-4000-8000-000000000000", { ms: 200 }),
    ).rejects.toMatchObject({ code: "too_late" });
  } finally {
    vi.useRealTimers();
  }
});

it("offers team duels and lets an organizer choose it on a fresh station", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  api.mock.setSession("dev-organizer-1");
  expect((await api.listStationBoard()).games).toContainEqual({
    id: "team_duels",
    name: "Team duels",
  });
  const { station } = await api.createStation({ label: "Duels" });
  expect((await api.setStationGame(station.id, "team_duels")).station.game).toBe("team_duels");
});

it("scores a tied duel independently alongside a loss", () => {
  expect(
    scoreReactions([
      { your_ms: 350, their_ms: 350 },
      { your_ms: 400, their_ms: 350 },
    ]),
  ).toEqual({ outcome: "loss", your_team_wins: 1, their_team_wins: 2 });
});
it("gives neither team a win when neither side has a time", () => {
  expect(scoreReactions([{ your_ms: null, their_ms: null }])).toEqual({
    outcome: "loss",
    your_team_wins: 0,
    their_team_wins: 0,
  });
});
it("does not award a round piece for a 0 to 0 timeout", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: "nobody-won" });
  api.mock.setSession("dev-user-1");
  const me = await api.me();
  expect(me.round?.result).toEqual({ outcome: "loss", your_team_wins: 0, their_team_wins: 0 });
  expect(me.round_wins).toBe(0);
});

it("scores a tied duel and a lost duel through the play endpoint", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: "odd" });
  api.mock.setSession("dev-user-1");
  await api.playDuelReaction("20000000-0000-4000-8000-000000000000", { ms: 350 });
  await api.playDuelReaction("20000000-0000-4000-8000-000000000001", { ms: 400 });
  const me = await api.me();
  expect(me.round?.result).toEqual({ outcome: "loss", your_team_wins: 1, their_team_wins: 2 });
  expect(me.round_wins).toBe(0);
});
it("times out a 0 to 0 round without awarding a piece", async () => {
  vi.useFakeTimers();
  try {
    const api = createMockClient({ storage: null, latencyMs: [0, 0], roundScenario: "timeout" });
    api.mock.setSession("dev-user-1");
    vi.advanceTimersByTime(120000);
    const me = await api.me();
    expect(me.round?.result).toEqual({ outcome: "loss", your_team_wins: 0, their_team_wins: 0 });
    expect(me.round_wins).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
