/**
 * The rules for a group's fields (draft for agreement 0.14). A name, each tag and a location are
 * trimmed, then at most 80 characters, counted as Unicode code points, as agreement 9.1 counts a
 * name. A group has at most 5 tags. The screens check them before sending so the answer is
 * quick, and the service has the last word.
 */
export const GROUP_TEXT_MAX = 80;

export const GROUP_TAGS_MAX = 5;

export function isGroupText(text: string): boolean {
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  return [...text.trim()].length <= GROUP_TEXT_MAX;
}
