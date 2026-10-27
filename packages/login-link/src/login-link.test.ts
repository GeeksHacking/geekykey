import assert from "node:assert/strict";
import { test } from "vitest";
import { loginLinks } from "./login-link.ts";

/** An Event Service key, as `openssl rand -hex 32` writes one. */
const KEY = "e".repeat(64);

/** 18 Nov 2026, 13:00 UTC, so a link expires at the agreement's example `expires_at`. */
const NOW = new Date("2026-11-18T13:00:00.000Z");

test("a link reads back as the user and name it was made for, for 60 seconds", async () => {
  const links = loginLinks(KEY);
  const made = await links.make({ userId: "firebase-uid-1", name: "Ada Lim", now: NOW });
  assert.deepEqual(made.expiresAt, new Date("2026-11-18T13:01:00.000Z"));

  const read = await links.read(made.link, NOW);
  assert.ok(read);
  const { jti, ...rest } = read;
  assert.deepEqual(rest, {
    userId: "firebase-uid-1",
    name: "Ada Lim",
    expiresAt: new Date("2026-11-18T13:01:00.000Z"),
  });
  assert.match(jti, /^[0-9a-f]{32}$/);
});

/**
 * A link built by hand from the agreement's 11.9, outside this package, with
 * Python's hmac and hashlib: the payload's JSON, HKDF-SHA256 of KEY with an
 * empty salt and the info `geekykey login link`, then HMAC-SHA256. Another
 * team's Event Service, checking by the agreement, agrees with this package.
 */
const LINK_BUILT_BY_HAND =
  "eyJ2IjoxLCJzdWIiOiJmaXJlYmFzZS11aWQtMSIsIm5hbWUiOiJBZGEgTGltIiwiZXhwIjoxNzk1MDA2ODYwLCJqdGkiOiI5ZjJjNGUwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCJ9" +
  ".4HBn61x82PBJn0UlI7aYrTEUcwTb0mairt2f0CPHpGI";

test("a link built by hand from the agreement's recipe reads as its payload says", async () => {
  assert.deepEqual(await loginLinks(KEY).read(LINK_BUILT_BY_HAND, NOW), {
    userId: "firebase-uid-1",
    name: "Ada Lim",
    jti: "9f2c4e00000000000000000000000000",
    expiresAt: new Date("2026-11-18T13:01:00.000Z"),
  });
});

/** A link for `payload`, signed as the agreement says, so a test can break one rule at a time. */
function signedLink(payload: unknown, key = KEY) {
  return signedText(JSON.stringify(payload), key);
}

/** A link whose first part is `text`, whatever it is, signed with the login link key from `key`. */
async function signedText(text: string, key = KEY) {
  const toBase64Url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  const ikm = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(key.match(/../g)!, (pair) => parseInt(pair, 16)),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: new TextEncoder().encode("geekykey login link"),
    },
    ikm,
    256,
  );
  const hmac = await crypto.subtle.importKey(
    "raw",
    bits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const body = toBase64Url(new TextEncoder().encode(text));
  const signature = await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** A payload that reads, as of NOW. */
const GOOD = {
  v: 1,
  sub: "firebase-uid-1",
  name: "Ada Lim",
  exp: NOW.getTime() / 1000 + 60,
  jti: "0123456789abcdef0123456789abcdef",
};

test("the payload a test signs reads, so each refusal below is down to its one change", async () => {
  assert.ok(await loginLinks(KEY).read(await signedLink(GOOD), NOW));
  assert.ok(await loginLinks(KEY).read(await signedLink({ ...GOOD, name: null }), NOW));
});

test("a link that's expired, changed, for another Event Service or not a link reads as null", async () => {
  const links = loginLinks(KEY);
  const good = await signedLink(GOOD);
  const [body, signature] = good.split(".") as [string, string];
  const changedBody = btoa(JSON.stringify({ ...GOOD, sub: "someone-else" }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const refused: Record<string, string> = {
    "expired, at the second it expires": await signedLink({ ...GOOD, exp: NOW.getTime() / 1000 }),
    "with its payload changed": `${changedBody}.${signature}`,
    "with its signature changed": `${body}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`,
    "with no signature": `${body}.`,
    "with a signature base64 can't decode": `${body}.A`,
    "with only a payload": body,
    "with a third part": `${good}.${signature}`,
    "made with another Event Service's key": await signedLink(GOOD, "f".repeat(64)),
    "of another version": await signedLink({ ...GOOD, v: 2 }),
    "with no user ID": await signedLink({ ...GOOD, sub: "" }),
    "with a user ID over 128 characters": await signedLink({ ...GOOD, sub: "a".repeat(129) }),
    "with a name over 100 characters": await signedLink({ ...GOOD, name: "a".repeat(101) }),
    "with no name field": await signedLink({ ...GOOD, name: undefined }),
    "with an exp that isn't a whole number": await signedLink({ ...GOOD, exp: "1795006860" }),
    "with a jti that isn't 32 hex characters": await signedLink({ ...GOOD, jti: "0123" }),
    "whose payload isn't JSON": await signedText("not json"),
    "whose payload is JSON but not an object": await signedText("null"),
    "that isn't base64url": "not a link!.at all?",
    empty: "",
  };
  for (const [what, link] of Object.entries(refused)) {
    assert.equal(await links.read(link, NOW), null, what);
  }
});

test("a name over 100 characters is cut to its first 100, counted as code points", async () => {
  const links = loginLinks(KEY);
  // 🦊 is one code point, and two UTF-16 units.
  const long = `${"🦊".repeat(99)}ab`;
  const { link } = await links.make({ userId: "firebase-uid-1", name: long, now: NOW });
  assert.equal((await links.read(link, NOW))?.name, `${"🦊".repeat(99)}a`);

  const guest = await links.make({ userId: "firebase-guest-1", name: null, now: NOW });
  assert.equal((await links.read(guest.link, NOW))?.name, null);
});

test("each link has its own jti", async () => {
  const links = loginLinks(KEY);
  const jtis = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const { link } = await links.make({ userId: "firebase-uid-1", name: null, now: NOW });
    jtis.add((await links.read(link, NOW))!.jti);
  }
  assert.equal(jtis.size, 20);
});
