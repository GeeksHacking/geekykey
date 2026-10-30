import { z } from "zod";

/** How long a link works after it's made (the API agreement's 8.6). */
const LIFETIME_SECONDS = 60;

/** HKDF's `info` for the login link key (the API agreement's 11.9). */
const KEY_INFO = "geekykey login link";

/** The longest name a link carries, in Unicode code points (the API agreement's 11.9). */
export const LOGIN_LINK_NAME_MAX = 100;

/** The most characters in a token's kind, as in the hand-off (the API agreement's 11.2 and 11.9). */
export const LOGIN_LINK_KIND_MAX = 32;

/** The payload's rules (the API agreement's 11.9). */
const payloadSchema = z.object({
  v: z.literal(1),
  // 1 to 128 characters, as in the hand-off (11.2).
  sub: z.string().min(1).max(128),
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  name: z
    .string()
    .refine((name) => [...name].length <= LOGIN_LINK_NAME_MAX)
    .nullable(),
  exp: z.int(),
  jti: z.string().regex(/^[0-9a-f]{32}$/),
  // Left out by a GeekyKey Service from before kinds, which reads as none.
  kind: z.string().min(1).max(LOGIN_LINK_KIND_MAX).nullable().optional(),
});

/** base64url without padding: what each part of a link is written in. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** What a link says, once its signature and expiry check out. */
export interface LoginLink {
  /** `sub`: the user ID, the same in both services. */
  userId: string;
  /** `name`: the name from the user's login, or null when it had none, as a guest's has none. */
  name: string | null;
  /**
   * `kind`: the kind of the token whose page made the link (ADR 0006), or null
   * when it has none, the user doesn't own it, or the link came from no token's page.
   */
  kind: string | null;
  /** `jti`: 32 lower-case hex characters, which the Event Service keeps so the link works once. */
  jti: string;
  /** `exp`: when it stops working. */
  expiresAt: Date;
}

export interface MadeLoginLink {
  /** `base64url(payload).base64url(HMAC-SHA256)`, for the fragment of the event's address. */
  link: string;
  expiresAt: Date;
}

export interface LoginLinks {
  /**
   * A new link for `userId`, which works once, for 60 seconds from `now`.
   * `kind` is null unless given.
   */
  make(user: {
    userId: string;
    name: string | null;
    kind?: string | null;
    now?: Date;
  }): Promise<MadeLoginLink>;
  /**
   * What `link` says, or null when it can't be trusted: not signed with this
   * key, changed, expired, or not in the agreement's shape. Whether it has
   * been used already is the Event Service's to check, by its `jti`.
   */
  read(link: string, now?: Date): Promise<LoginLink | null>;
}

/**
 * Login links for one Event Service, signed with the key HKDF derives from
 * its Event Service key (the API agreement's 11.9). The GeekyKey Service
 * makes them, and the Event Service reads them.
 */
export function loginLinks(eventServiceKey: string): LoginLinks {
  // Derived once, on first use.
  const key = loginLinkKey(eventServiceKey);

  return {
    async make({ userId, name, kind = null, now = new Date() }) {
      const exp = Math.floor(now.getTime() / 1000) + LIFETIME_SECONDS;
      // Cut by code points, so a name is never cut through the middle of one.
      const cutName = name === null ? null : [...name].slice(0, LOGIN_LINK_NAME_MAX).join("");
      const payload = { v: 1, sub: userId, name: cutName, exp, jti: randomJti(), kind };
      const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
      const signature = await crypto.subtle.sign("HMAC", await key, new TextEncoder().encode(body));
      return {
        link: `${body}.${toBase64Url(new Uint8Array(signature))}`,
        expiresAt: new Date(exp * 1000),
      };
    },

    async read(link, now = new Date()) {
      const parts = link.split(".");
      if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return null;
      const [body, signature] = parts as [string, string];
      const signatureBytes = fromBase64Url(signature);
      if (signatureBytes === null) return null;
      // crypto.subtle.verify compares in constant time, as 11.9 asks.
      const signed = await crypto.subtle.verify(
        "HMAC",
        await key,
        signatureBytes,
        new TextEncoder().encode(body),
      );
      if (!signed) return null;

      const bodyBytes = fromBase64Url(body);
      if (bodyBytes === null) return null;
      let json: unknown;
      try {
        // fatal: bytes that aren't UTF-8 throw, rather than turning into U+FFFD. ignoreBOM is
        // its default, given because the Workers types want it.
        json = JSON.parse(
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bodyBytes),
        );
      } catch {
        return null;
      }
      const payload = payloadSchema.safeParse(json);
      if (!payload.success) return null;
      const { sub, name, exp, jti, kind = null } = payload.data;
      if (exp * 1000 <= now.getTime()) return null;
      return { userId: sub, name, kind, jti, expiresAt: new Date(exp * 1000) };
    },
  };
}

/** HKDF-SHA256 of the Event Service key's 32 bytes, an empty salt, KEY_INFO, 32 bytes out. */
async function loginLinkKey(eventServiceKey: string) {
  const input = await crypto.subtle.importKey("raw", fromHex(eventServiceKey), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: new TextEncoder().encode(KEY_INFO),
    },
    input,
    256,
  );
  return crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** 16 random bytes as 32 lower-case hex characters. */
function randomJti(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** base64url without padding. btoa, since both Node and workerd have it and neither needs Buffer. */
function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** The bytes of base64url `text`, or null when it can't be decoded, as a length of 1 more than a multiple of 4 can't. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  let binary: string;
  try {
    binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return null;
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
