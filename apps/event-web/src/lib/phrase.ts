/*
  The phrase's limits (BAC-169, draft for the agreement's next version), as the Event Service
  checks them in apps/event-service/src/event/phrase.ts. The Groups screen checks them first, so a
  phrase outside them is refused where it was typed.
*/

/** The fewest words a phrase has. */
export const PHRASE_WORDS_MIN = 2;

/** The most words a phrase has. */
export const PHRASE_WORDS_MAX = 12;

/** The longest word, in Unicode code points. */
export const PHRASE_WORD_LENGTH_MAX = 20;

/** The words of a phrase as typed: any run of spaces or line breaks separates two. */
export function phraseWords(text: string): string[] {
  return text.split(/\s+/u).filter((word) => word !== "");
}

/** What stops `words` being saved as a phrase, or null. No words is no phrase, which is allowed. */
export function phraseProblem(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  if (words.length < PHRASE_WORDS_MIN || words.length > PHRASE_WORDS_MAX) {
    return `Use ${PHRASE_WORDS_MIN} to ${PHRASE_WORDS_MAX} words.`;
  }
  // Spread, not .length, which would count an emoji twice.
  if (words.some((word) => [...word].length > PHRASE_WORD_LENGTH_MAX)) {
    return `Use at most ${PHRASE_WORD_LENGTH_MAX} characters in each word.`;
  }
  return null;
}
