import { describe, expect, it } from "vitest";

import { NetworkError } from "@/api/errors";
import {
  parseClaimResponse,
  parseLoginLinkResponse,
  parseMeResponse,
  parseTokenLookupResponse,
} from "@/api/schemas";

const iso = "2026-10-10T08:30:00.000Z";

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

  it("keeps a claim time for a token you own", () => {
    const lookup = parseTokenLookupResponse({
      token: { uid: "04A1B2C3D4E5F6", owner: "you", claimed_at: iso, owner_id: null },
    });
    expect(lookup.claimed_at).toBe(iso);
  });

  it("rejects a token missing a field the agreement lists", () => {
    const incomplete: Record<string, unknown> = {
      uid: "04A1B2C3D4E5F6",
      owner: "nobody",
      claimed_at: null,
    };
    delete incomplete.owner_id;
    expect(() => parseTokenLookupResponse({ token: incomplete })).toThrow(NetworkError);
  });

  it("rejects a claimed_at that is not ISO", () => {
    expect(() =>
      parseTokenLookupResponse({
        token: { uid: "04A1B2C3D4E5F6", owner: "you", claimed_at: "yesterday", owner_id: null },
      }),
    ).toThrow(NetworkError);
  });

  it("accepts a claim response", () => {
    const token = parseClaimResponse({ token: { uid: "04A1B2C3D4E5F6", claimed_at: iso } });
    expect(token.uid).toBe("04A1B2C3D4E5F6");
  });

  it("rejects a claim response with no token wrapper", () => {
    expect(() => parseClaimResponse({ uid: "04A1B2C3D4E5F6", claimed_at: iso })).toThrow(
      NetworkError,
    );
  });

  it("accepts a login link, which the agreement answers with no wrapper", () => {
    const link = parseLoginLinkResponse({
      url: "https://event.geekshacking.com/#login=eyJ2IjoxfQ.c2ln",
      expires_at: iso,
    });

    expect(link.url).toBe("https://event.geekshacking.com/#login=eyJ2IjoxfQ.c2ln");
    expect(link.expires_at).toBe(iso);
  });

  it("rejects a login link with no url, or with an expiry that is not a time", () => {
    expect(() => parseLoginLinkResponse({ expires_at: iso })).toThrow(NetworkError);
    expect(() =>
      parseLoginLinkResponse({ url: "https://event.geekshacking.com/#login=eyJ2IjoxfQ.c2ln" }),
    ).toThrow(NetworkError);
    expect(() =>
      parseLoginLinkResponse({
        url: "https://event.geekshacking.com/#login=eyJ2IjoxfQ.c2ln",
        expires_at: "in a minute",
      }),
    ).toThrow(NetworkError);
  });

  it("turns any unexpected shape into a NetworkError, not a raw Zod error", () => {
    for (const bad of [undefined, null, "a string", 42, []]) {
      expect(() => parseMeResponse(bad)).toThrow(NetworkError);
    }
  });
});
