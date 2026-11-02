import { z } from "zod";

/**
 * Text a person types, such as a name or an answer: trimmed, then 1 to `max`
 * characters, counted as Unicode code points, in any script. A string that
 * breaks the rule fails with `message`.
 */
export function trimmedText(max: number, message: string) {
  return (
    z
      .string()
      .trim()
      // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
      .refine((text) => text !== "" && [...text].length <= max, message)
  );
}
