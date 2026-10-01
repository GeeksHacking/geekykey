import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

function client() {
  return createMockClient({ latencyMs: [0, 0], storage: null });
}

async function expectApiError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
  expect((error as ApiError).status).toBe(status);
}

describe("sessions and roles", () => {
  it("answers /me with 401 when nobody is signed in", async () => {
    await expectApiError(client().me(), "unauthenticated", 401);
  });

  it("gives participants 403 on organiser endpoints", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await expectApiError(api.listStations(), "forbidden", 403);
  });

  it("returns a stamp slot for every station, earned or not", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const me = await api.me();
    expect(me.stamps).toHaveLength(api.mock.data.stations.length);
    expect(me.stamps.some((s) => s.earned_at === null)).toBe(true);
    expect(me.stamps.some((s) => s.earned_at !== null)).toBe(true);
    expect(me.recent_taps.length).toBeGreaterThan(0);
  });
});

describe("scan log", () => {
  it("pages newest first with a before_id cursor and no overlap", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const first = await api.listTaps({ limit: 10 });
    expect(first.taps).toHaveLength(10);
    expect(first.taps[0]!.id).toBeGreaterThan(first.taps[9]!.id);
    expect(first.next_before_id).toBe(first.taps[9]!.id);
    const second = await api.listTaps({ limit: 10, before_id: first.next_before_id! });
    expect(second.taps.every((t) => t.id < first.next_before_id!)).toBe(true);
  });

  it("filters stored statuses and keeps the user on no_game taps", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const noGame = await api.listTaps({ status: "no_game" });
    expect(noGame.taps.length).toBeGreaterThan(0);
    expect(noGame.taps.every((t) => t.status === "no_game" && t.user !== null)).toBe(true);
  });
});

describe("QR fallback", () => {
  it("accepts once, then cooldown for the same participant at the same station", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.find((s) => s.name === "3D Printing Booth")!;
    const first = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    expect(first.result.status).toBe("accepted");
    const second = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    expect(second.result.status).toBe("cooldown");
  });

  it("accepts a known user_id fallback without an active token", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.tokens = api.mock.data.tokens.filter((token) => token.user_id !== "u_2e8b");
    const station = api.mock.data.stations.find((s) => s.name === "3D Printing Booth")!;
    const result = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    const stored = api.mock.data.taps.find((tap) => tap.id === result.result.id)!;
    expect(result.result.status).toBe("accepted");
    expect(stored.user_id).toBe("u_2e8b");
    expect(stored.token_uid).toBeNull();
  });

  it("rejects the temporary UID fallback mode without storing a tap", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations[0]!;
    await expectApiError(
      api.createFallbackTap({ station_id: station.id, uid: "04FFFFFFFFFFFF" }),
      "validation_failed",
      400,
    );
    expect(api.mock.data.taps.some((tap) => tap.token_uid === "04FFFFFFFFFFFF")).toBe(false);
  });

  it("rejects a UID in the temporary QR fallback mode", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations[0]!;
    await expectApiError(
      api.createFallbackTap({ station_id: station.id, uid: "zz" }),
      "validation_failed",
      400,
    );
  });

  it("returns 404 for a station that does not exist", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await expectApiError(
      api.createFallbackTap({ station_id: "nope", user_id: "u_2e8b" }),
      "not_found",
      404,
    );
  });
});

describe("station keys and export", () => {
  it("returns the key once, prefixed, and never in the list", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const created = await api.createStation({ name: "Robotics Corner", points: 2 });
    expect(created.api_key.startsWith("gk_sta_")).toBe(true);
    const list = await api.listStations();
    const listed = list.stations.find((s) => s.id === created.station.id);
    expect(listed).toBeDefined();
    expect(JSON.stringify(listed)).not.toContain(created.api_key);
  });

  it("exports the agreed CSV columns in order", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const blob = await api.exportCsv();
    const text = await blob.text();
    expect(text.split("\n")[0]).toBe(
      "tap_id,client_tap_id,station_id,station_name,user_id,display_name,token_uid,status,source,tapped_at,received_at",
    );
  });

  it("writes an empty CSV token cell for a user_id fallback without a token", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.data.tokens = api.mock.data.tokens.filter((token) => token.user_id !== "u_2e8b");
    const station = api.mock.data.stations.find((s) => s.name === "3D Printing Booth")!;
    const result = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    const text = await (await api.exportCsv()).text();
    const row = text.split("\n").find((line) => line.startsWith(`${result.result.id},`));
    expect(row?.split(",")[6]).toBe("");
  });

  it("can be told to fail once", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.failNext("internal_error");
    await expectApiError(api.stats(), "internal_error", 500);
    await expect(api.stats()).resolves.toBeDefined();
  });
});
