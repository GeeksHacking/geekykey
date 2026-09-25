import { getCollection, type CollectionEntry } from "astro:content";

import { checkText, failer } from "./checks";
import { isoDay, smartQuotes } from "./format";

export type Entry = CollectionEntry<"entries">;

/**
 * Every entry, newest first, after the checks the schema cannot make on its own. Pages
 * call this rather than getCollection, so no page can skip the checks.
 *
 * Two entries can end on the same day when one continues the other. The one whose window
 * starts later is the continuation, so it sorts as the newer of the two.
 */
export async function getEntries(): Promise<Entry[]> {
  const entries = await getCollection("entries");
  for (const entry of entries) check(entry);
  return entries
    .map(typeset)
    .sort(
      (a, b) =>
        b.data.date.getTime() - a.data.date.getTime() ||
        b.data.window.from.getTime() - a.data.window.from.getTime(),
    );
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

function check(entry: Entry) {
  const fail = failer(entry.filePath ?? entry.id);

  const date = isoDay(entry.data.date);
  if (!entry.id.startsWith(date)) {
    fail(`the file name should start with the entry's date, ${date}.`);
  }

  checkText(
    [
      entry.data.title,
      entry.data.summary,
      ...(entry.data.asks ?? []).flatMap((ask) => [ask.who, ask.what]),
      ...(entry.body ?? "").split("\n"),
    ],
    fail,
  );
}
