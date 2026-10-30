/**
 * Checks shared by entries and changelog lines: the text rules the schema cannot express.
 */

// The design rules (.agents/skills/design-taste-frontend-v2-experimental/SKILL.md, 9.G) ban
// en and em dashes anywhere a reader can see them. Written text is where one would slip in.
const BANNED_DASH = /[–—]/;

// Words CONTEXT.md lists under _Avoid_, each with the term to use instead. Only the ones with no
// other meaning in our writing: "backend", "organizer" or "tag" are fine words elsewhere, so a
// person still catches those.
const AVOIDED_WORDS: [RegExp, string][] = [
  [/\bvisitors?\b/i, `"participant", or "guest" for someone who logged in with one tap`],
  [/\bportal users?\b/i, `"user"`],
  [/\banonymous users?\b/i, `"guest"`],
  [/\bNFC Key service\b/i, `"GeekyKey Service"`],
  [/\btokens service\b/i, `"claims stand-in"`],
  [/\bstamp books?\b/i, `"passport"`],
  [/\bempty stamps?\b/i, `"stamp slot"`],
  [/\bdual taps?\b/i, `"connection"`],
  [/\blinks? between tags\b/i, `"connection"`],
];

/** Throws with `file` in the message, so the build output says where to look. */
export function failer(file: string) {
  return (problem: string): never => {
    throw new Error(`${file}: ${problem}`);
  };
}

/**
 * Fails on a banned dash or an avoided word anywhere, and on a TODO( marker in the build that
 * publishes.
 */
export function checkText(text: string[], fail: (problem: string) => never) {
  const dashed = text.find((line) => BANNED_DASH.test(line));
  if (dashed) {
    fail(
      `this line has an en or em dash, which the design rules ban. Use a comma, a colon, ` +
        `brackets or a full stop instead:\n\n  ${dashed.trim()}\n`,
    );
  }

  for (const [word, instead] of AVOIDED_WORDS) {
    const line = text.find((candidate) => word.test(candidate));
    if (line) {
      fail(
        `this line says "${line.match(word)![0]}", which CONTEXT.md asks us to avoid. ` +
          `Use ${instead}:\n\n  ${line.trim()}\n`,
      );
    }
  }

  // A draft can carry TODO( markers while it is being written. The published site cannot.
  if (import.meta.env.PROD && text.some((line) => line.includes("TODO("))) {
    fail(`it still has a TODO( marker. Finish it or take it out before publishing.`);
  }
}
