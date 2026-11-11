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

/** Groups a normalised UID in pairs, with `separator` between them. */
function groupUid(uid: string, separator: string): string {
  return normalizeUid(uid).replace(/(..)(?=.)/g, `$1${separator}`);
}

/** What the page shows and links to. Grouped in pairs so it is readable on a phone. */
export function formatUid(uid: string): string {
  return groupUid(uid, " ");
}

/**
 * The claim form's UID as it is typed (FRO-74): upper-case, in colon pairs, so it is easy
 * to check against the token in your hand. The placeholder shows the same shape, and a
 * partial UID takes no trailing colon.
 */
export function formatUidInput(raw: string): string {
  return groupUid(raw, ":");
}

/** The grouped text is upper-case, so this matches its hex digits. */
const HEX_DIGIT = /[0-9A-F]/;

/**
 * Where the caret goes in the grouped UID after an edit (FRO-74). The browser reports the
 * caret against the text it handed us, so count the hex digits before it and put the caret
 * after the same number in the grouped text. That keeps an edit in the middle where it was
 * instead of jumping to the end.
 */
export function uidCaretPosition(raw: string, caret: number, formatted: string): number {
  const digitsBefore = normalizeUid(raw.slice(0, caret)).length;
  if (digitsBefore === 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (!HEX_DIGIT.test(formatted.charAt(index))) continue;
    seen += 1;
    if (seen === digitsBefore) return index + 1;
  }
  return formatted.length;
}

/**
 * The token address (agreement, "The token address"), `/t/<UID>` on the site this page is
 * open on. On production that is `https://key.geekshacking.com/t/<UID>`, what the chip
 * itself holds, so a QR code of it opens the same token page a tap does (FRO-166). On
 * staging or a dev server it stays on that site, so the code can be tried there.
 */
export function tokenAddress(uid: string): string {
  return `${window.location.origin}/t/${normalizeUid(uid)}`;
}
