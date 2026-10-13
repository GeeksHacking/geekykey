/**
 * A token UID as it appears in the token page's address, `/t/<UID>` (agreement "Token
 * UID"): the chip's own UID in upper-case hex, for example `/t/04A1B2C3D4E5F6`.
 *
 * The services normalise on input by stripping anything that is not a hex digit and
 * upper-casing, so `04:a1:b2:c3:d4:e5:f6` and `04A1B2C3D4E5F6` are one token. A UID
 * must be 4 to 10 bytes, that is 8 to 20 hex characters, and the count must be even
 * because a chip's UID is whole bytes. The services always answer with the normalised
 * form, so this only shapes the address the user arrived on.
 */
export function normalizeUid(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/** 4 to 10 bytes as whole bytes: 8 to 20 hex characters, and an even count. */
export function isValidUid(uid: string): boolean {
  return uid.length >= 8 && uid.length <= 20 && uid.length % 2 === 0;
}

/** What the page shows and links to. Grouped in pairs so it is readable on a phone. */
export function formatUid(uid: string): string {
  return normalizeUid(uid).replace(/(..)(?=.)/g, "$1 ");
}
