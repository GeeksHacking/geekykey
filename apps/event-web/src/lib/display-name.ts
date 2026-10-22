/**
 * The rule for the name the event shows (agreement 8.7): trimmed, then 1 to 30 characters,
 * counted as Unicode code points, in any script. The screens check it before sending so the
 * answer is quick, and the service has the last word.
 */
export const DISPLAY_NAME_MAX = 30;

export function isDisplayName(name: string): boolean {
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  const length = [...name.trim()].length;
  return length >= 1 && length <= DISPLAY_NAME_MAX;
}
