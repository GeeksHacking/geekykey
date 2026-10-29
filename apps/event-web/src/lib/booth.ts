/**
 * The rule for a station's booth (agreement 9.12): trimmed, then at most 80 characters,
 * counted as Unicode code points, as 9.1 counts a name and a location. A blank booth is
 * none, which the rule allows. The screens check it before sending so the answer is quick,
 * and the service has the last word.
 */
export const BOOTH_MAX = 80;

export function isBooth(booth: string): boolean {
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  return [...booth.trim()].length <= BOOTH_MAX;
}
