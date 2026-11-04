import { z } from "zod";

/**
 * The longest station label, passport name, location or booth, in Unicode code
 * points (the API agreement's 9.1 and 9.7), and of a group's name, in the
 * participant groups spec's draft for the agreement's 0.14.
 */
const TEXT_MAX = 80;

/**
 * Text an organizer types: trimmed, then at most 80 code points, and at least
 * one unless `blankAllowed`.
 */
export const organizerText = (field: string, { blankAllowed = false } = {}) =>
  z
    .string()
    .trim()
    // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
    .refine(
      (text) => (blankAllowed || text !== "") && [...text].length <= TEXT_MAX,
      `${field} must be ${blankAllowed ? 0 : 1} to ${TEXT_MAX} characters`,
    );
