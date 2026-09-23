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

describe("pairing", () => {
  it("normalises the UID and is idempotent for the same user", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const first = await api.pairToken("04:ab:cd:ef:01:23:45");
    expect(first.created).toBe(true);
    expect(first.token.uid).toBe("04ABCDEF012345");
    const again = await api.pairToken("04ABCDEF012345");
    expect(again.created).toBe(false);
  });

  it("rejects a token that belongs to someone else with 409", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    await expectApiError(api.pairToken("04A1B2C3D4E5F6"), "uid_already_paired", 409);
  });

  it("returns validation issues with a field path", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    const error = (await api.pairToken("zz").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("validation_failed");
    expect(error.issues[0]?.path).toEqual(["uid"]);
  });

  it("lets a revoked token be paired again by anyone", async () => {
    const api = client();
    await api.devLogin(SEEDED_PARTICIPANT_ID);
    await api.unpairToken("04A1B2C3D4E5F6");
    await api.logout();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const paired = await api.pairToken("04A1B2C3D4E5F6");
    expect(paired.created).toBe(true);
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

  it("filters by status and leaves user null on unknown tokens", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const unknown = await api.listTaps({ status: "unknown_token" });
    expect(unknown.taps.length).toBeGreaterThan(0);
    expect(unknown.taps.every((t) => t.status === "unknown_token" && t.user === null)).toBe(true);
  });
});

describe("QR fallback", () => {
  it("accepts once, then cooldown for the same participant at the same station", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.find((s) => s.name === "Photo Wall")!;
    const first = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    expect(first.result.status).toBe("accepted");
    const second = await api.createFallbackTap({ station_id: station.id, user_id: "u_2e8b" });
    expect(second.result.status).toBe("cooldown");
  });

  it("records an unpaired UID as unknown_token rather than failing", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations[0]!;
    const result = await api.createFallbackTap({ station_id: station.id, uid: "04FFFFFFFFFFFF" });
    expect(result.result.status).toBe("unknown_token");
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

  it("can be told to fail once", async () => {
    const api = client();
    await api.devLogin(SEEDED_ORGANIZER_ID);
    api.mock.failNext("internal_error");
    await expectApiError(api.stats(), "internal_error", 500);
    await expect(api.stats()).resolves.toBeDefined();
  });
});
