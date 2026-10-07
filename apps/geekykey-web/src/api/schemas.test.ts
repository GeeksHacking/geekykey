import { describe, expect, it } from "vitest";

import { NetworkError } from "@/api/errors";
import {
  parseClaimResponse,
  parseListStationsResponse,
  parseMeResponse,
  parseStationResponse,
  parseTokenLookupResponse,
} from "@/api/schemas";

const iso = "2026-10-10T08:30:00.000Z";

const station = {
  id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  label: "Reader 3",
  created_at: iso,
  link: {
    event_service_id: "showcase",
    event_service_name: "Capstone Showcase",
    linked_at: iso,
  },
  disabled_at: null,
  last_seen_at: iso,
  online: true,
  firmware_version: "0.3.1",
  buffered_taps: 0,
  reader_ok: true,
};

describe("geekykey-web schemas", () => {
  it("accepts the agreement's /me and strips keys it does not list", () => {
    const me = parseMeResponse({
      user: { id: "dev-user-1", is_geekykey_admin: false },
      tokens: [{ uid: "04A1B2C3D4E5F6", claimed_at: iso }],
      events: [
        { id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" },
      ],
      // The Event Service's /me has these; this one must not leak them through.
      display_name: "Alex",
      points: 3,
    });

    expect(me.user).toEqual({ id: "dev-user-1", is_geekykey_admin: false });
    expect(me.tokens).toHaveLength(1);
    expect(me.events[0]?.name).toBe("Capstone Showcase");
    expect("points" in me).toBe(false);
  });

  it("accepts a /me with no tokens and no events", () => {
    const me = parseMeResponse({
      user: { id: "dev-user-1", is_geekykey_admin: false },
      tokens: [],
      events: [],
    });
    expect(me.tokens).toEqual([]);
  });

  it("rejects an owner value the agreement does not define", () => {
    expect(() =>
      parseTokenLookupResponse({
        token: { uid: "04A1B2C3D4E5F6", owner: "maybe", claimed_at: null, owner_id: null },
      }),
    ).toThrow(NetworkError);
  });

  it("accepts each of the three owner values", () => {
    for (const owner of ["nobody", "you", "someone_else"] as const) {
      const lookup = parseTokenLookupResponse({
        token: { uid: "04A1B2C3D4E5F6", owner, claimed_at: null, owner_id: null },
      });
      expect(lookup.owner).toBe(owner);
    }
  });

  it("keeps a null claim time and a null owner_id", () => {
    const lookup = parseTokenLookupResponse({
      token: { uid: "04E5F7091B3D", owner: "nobody", claimed_at: null, owner_id: null },
    });
    expect(lookup.claimed_at).toBeNull();
    expect(lookup.owner_id).toBeNull();
  });

  it("accepts a claim response", () => {
    const token = parseClaimResponse({ token: { uid: "04A1B2C3D4E5F6", claimed_at: iso } });
    expect(token.uid).toBe("04A1B2C3D4E5F6");
  });

  it("accepts the station registry with a null link", () => {
    const list = parseListStationsResponse({
      stations: [{ ...station, link: null }],
      event_services: [{ id: "showcase", name: "Capstone Showcase" }],
    });
    expect(list.stations[0]?.link).toBeNull();
  });

  it("accepts a link whose event_service_name is null", () => {
    const list = parseListStationsResponse({
      stations: [{ ...station, link: { ...station.link, event_service_name: null } }],
      event_services: [],
    });
    expect(list.stations[0]?.link?.event_service_name).toBeNull();
  });

  it("accepts a never-seen station with null heartbeat fields", () => {
    const list = parseListStationsResponse({
      stations: [
        {
          ...station,
          last_seen_at: null,
          online: false,
          firmware_version: null,
          buffered_taps: null,
          reader_ok: null,
        },
      ],
      event_services: [],
    });
    expect(list.stations[0]?.buffered_taps).toBeNull();
  });

  it("rejects a station missing a field the agreement lists", () => {
    const incomplete: Record<string, unknown> = { ...station };
    delete incomplete.reader_ok;
    expect(() => parseListStationsResponse({ stations: [incomplete], event_services: [] })).toThrow(
      NetworkError,
    );
  });

  it("rejects a buffered_taps that is not a whole number", () => {
    expect(() => parseStationResponse({ station: { ...station, buffered_taps: 1.5 } })).toThrow(
      NetworkError,
    );
    expect(() => parseStationResponse({ station: { ...station, buffered_taps: -1 } })).toThrow(
      NetworkError,
    );
  });

  it("rejects a timestamp that is not ISO", () => {
    expect(() =>
      parseStationResponse({ station: { ...station, created_at: "yesterday" } }),
    ).toThrow(NetworkError);
  });

  it("turns any unexpected shape into a NetworkError, not a raw Zod error", () => {
    for (const bad of [undefined, null, "a string", 42, []]) {
      expect(() => parseMeResponse(bad)).toThrow(NetworkError);
    }
  });
});
