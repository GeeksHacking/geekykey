import { getCollection, type CollectionEntry } from "astro:content";

import { isoDay, smartQuotes } from "./format";

export type Entry = CollectionEntry<"entries">;

/**
 * Every entry, newest first, after the checks the schema cannot make on its own. Pages
 * call this rather than getCollection, so no page can skip the checks.
 */
export async function getEntries(): Promise<Entry[]> {
  const entries = await getCollection("entries");
  for (const entry of entries) check(entry);
  return entries
    .map(typeset)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Curly quotes in the front matter a reader sees. The body gets them from the renderer. */
function typeset(entry: Entry): Entry {
  const { title, summary, asks } = entry.data;
  return {
    ...entry,
    data: {
      ...entry.data,
      title: smartQuotes(title),
      summary: smartQuotes(summary),
      asks: asks?.map((ask) => ({ who: smartQuotes(ask.who), what: smartQuotes(ask.what) })),
    },
  };
}

// The design rules (apps/frontend/.agents/skills/design-taste-frontend/SKILL.md, 9.G) ban
// en and em dashes anywhere a reader can see them. Entries are where one would slip in.
const BANNED_DASH = /[–—]/;

function check(entry: Entry) {
  const file = entry.filePath ?? entry.id;
  const fail = (problem: string): never => {
    throw new Error(`${file}: ${problem}`);
  };

  const date = isoDay(entry.data.date);
  if (!entry.id.startsWith(date)) {
    fail(`the file name should start with the entry's date, ${date}.`);
  }

  const text = [
    entry.data.title,
    entry.data.summary,
    ...(entry.data.asks ?? []).flatMap((ask) => [ask.who, ask.what]),
    ...(entry.body ?? "").split("\n"),
  ];

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
