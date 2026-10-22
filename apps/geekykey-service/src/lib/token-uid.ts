import { z } from "zod";

/**
 * A token's UID, as API-AGREEMENT.md's "Token UID" says: hex, with any
 * separators, normalised on input to upper-case hex digits only.
 */

/** 4 to 10 bytes of hex after normalisation, covering single, double, and triple size ISO 14443A UIDs. */
export const UID_PATTERN = /^(?:[0-9A-F]{2}){4,10}$/;

/** Strips separators readers commonly emit ("04:A1:B2" or "04 a1 b2") and upper-cases the hex. */
export function normaliseUid(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/**
 * A UID as a request carries it, in any separator style, read as its
 * normalised form, or a `validation_failed` issue saying it isn't one.
 */
export const tokenUid = z
  .string()
  .min(1)
  .max(64)
  .transform(normaliseUid)
  .pipe(z.string().regex(UID_PATTERN, "uid must be 4 to 10 hex bytes"));
