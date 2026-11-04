/**
 * The rule for a group's name (draft for agreement 0.14): trimmed, then 1 to 80 characters,
 * counted as Unicode code points, as agreement 9.1 counts a name. The screens check it before
 * sending so the answer is quick, and the service has the last word.
 */
export const GROUP_NAME_MAX = 80;

export function isGroupName(name: string): boolean {
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  return [...name.trim()].length <= GROUP_NAME_MAX;
}
