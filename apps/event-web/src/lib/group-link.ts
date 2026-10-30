/**
 * The rule for a station's group link (agreement 9.1): trimmed, then a URL that starts
 * with `https://` in any case, at most 300 characters counted as Unicode code points.
 * A blank link is none, which the rule allows. The screens check it before sending so the
 * answer is quick, and the service has the last word.
 */
export const GROUP_LINK_MAX = 300;

export function isGroupLink(link: string): boolean {
  const value = link.trim();
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  return /^https:\/\//i.test(value) && [...value].length <= GROUP_LINK_MAX;
}
