/**
 * The rules for the bio and the contact line (agreement 8.7, BAC-147): trimmed, then at most this
 * many characters, counted as Unicode code points as the name is. Blank clears one. The screens
 * check before sending so the answer is quick, and the service has the last word.
 */
export const BIO_MAX = 160;
export const CONTACT_LINE_MAX = 80;

export function fitsLimit(text: string, max: number): boolean {
  // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
  return [...text.trim()].length <= max;
}
