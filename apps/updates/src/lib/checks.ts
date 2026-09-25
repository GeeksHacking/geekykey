/**
 * Checks shared by entries and changelog lines: the text rules the schema cannot express.
 */

// The design rules (apps/frontend/.agents/skills/design-taste-frontend/SKILL.md, 9.G) ban
// en and em dashes anywhere a reader can see them. Written text is where one would slip in.
const BANNED_DASH = /[–—]/;

/** Throws with `file` in the message, so the build output says where to look. */
export function failer(file: string) {
  return (problem: string): never => {
    throw new Error(`${file}: ${problem}`);
  };
}

/** Fails on a banned dash anywhere, and on a TODO( marker in the build that publishes. */
export function checkText(text: string[], fail: (problem: string) => never) {
  const dashed = text.find((line) => BANNED_DASH.test(line));
  if (dashed) {
    fail(
      `this line has an en or em dash, which the design rules ban. Use a comma, a colon, ` +
        `brackets or a full stop instead:\n\n  ${dashed.trim()}\n`,
    );
  }

  // A draft can carry TODO( markers while it is being written. The published site cannot.
  if (import.meta.env.PROD && text.some((line) => line.includes("TODO("))) {
    fail(`it still has a TODO( marker. Finish it or take it out before publishing.`);
  }
}
