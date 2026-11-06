/**
 * The rules for a group's fields (draft for agreement 0.14). A name, each tag and a location are
 * trimmed, then at most 80 characters, counted as Unicode code points, as agreement 9.1 counts a
 * name. A group has at most 5 tags. The screens check them before sending so the answer is
 * quick, and the service has the last word.
 */
export const GROUP_TEXT_MAX = 80;

export const GROUP_TAGS_MAX = 5;

/** What a form says under a name, tag or location past GROUP_TEXT_MAX. */
export const GROUP_TEXT_TOO_LONG = "Keep it under 80 characters.";

export function isGroupText(text: string): boolean {
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  return [...text.trim()].length <= GROUP_TEXT_MAX;
}

/** The fewest people per group a split takes, and the fewest people it makes a group of. */
export const PEOPLE_PER_GROUP_MIN = 2;

/** The fewest groups a split by number of groups takes. */
export const GROUP_COUNT_MIN = 1;

/**
 * How many groups a split by people per group makes of `joined` people (BAC-141), or 0 with too
 * few. The service works this out itself at the press, so here it only tells the organizer what a
 * press would make.
 */
export function splitGroupCount(joined: number, peoplePerGroup: number): number {
  return Math.min(Math.ceil(joined / peoplePerGroup), Math.floor(joined / PEOPLE_PER_GROUP_MIN));
}
