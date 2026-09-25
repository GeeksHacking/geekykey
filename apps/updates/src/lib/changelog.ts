import { getCollection, type CollectionEntry } from "astro:content";

import raw from "../content/changelog.yaml?raw";
import { checkText, failer } from "./checks";
import { getEntries, type Entry } from "./entries";
import { isoDay, smartQuotes } from "./format";

export type Change = CollectionEntry<"changelog">;

/** The changes one entry covers, oldest first. No entry means they are not written up yet. */
export interface Stretch {
  entry?: Entry;
  changes: Change[];
}

const FILE = "src/content/changelog.yaml";
const fail = failer(FILE);

/**
 * The changelog cut into stretches, one per entry, oldest first. Pages call this rather
 * than getCollection, so no page can skip the checks.
 *
 * The file is one stream, oldest first, and entries are dividers in it. An entry covers
 * every line up to the end of the day it closes on. When two entries close on the same
 * day, the earlier one ends at the line marked `closes: <its id>` instead, and the rest of
 * that day belongs to the next. Lines after the latest entry are in a last stretch with no
 * entry: what has changed since the last update.
 */
export async function getChangelog(): Promise<Stretch[]> {
  const changes = inFileOrder(await getCollection("changelog")).map(typeset);
  for (const change of changes) check(change);

  const entries = (await getEntries()).reverse(); // oldest first
  const stretches: Stretch[] = [];
  const closedByMarker = new Set<string>();
  let current: Stretch = { entry: entries[0], changes: [] };

  const closeCurrent = () => {
    stretches.push(current);
    current = { entry: entries[stretches.length], changes: [] };
  };

  let previous: Change | undefined;
  for (const change of changes) {
    const { date, closes } = change.data;
    if (previous && date < previous.data.date) {
      fail(`"${change.id}" is dated before "${previous.id}" above it. Lines go oldest first.`);
    }
    previous = change;

    while (current.entry && date > current.entry.data.date) closeCurrent();

    const { entry } = current;
    if (entry && date < entry.data.window.from) {
      fail(
        `"${change.id}" is dated ${isoDay(date)}, before the window of the update that ` +
          `would cover it (${entry.id}) starts. Every line needs an update whose window ` +
          `includes its date.`,
      );
    }
    current.changes.push(change);

    if (closes) {
      if (closes !== entry?.id) {
        fail(
          `"${change.id}" says it closes ${closes}, but the update open at that line is ` +
            `${entry?.id ?? "none (it is after the latest update)"}.`,
        );
      }
      closedByMarker.add(closes);
      closeCurrent();
    }
  }
  while (current.entry) closeCurrent();
  stretches.push(current);

  checkSharedDays(entries, changes, closedByMarker);
  return stretches;
}

/**
 * The lines in the order they are written. getCollection() does not keep the file's order,
 * so it comes from the raw text, where every line starts with "- id:" at the left edge.
 *
 * This also catches what Astro's file() loader lets through with only a message in the
 * log: a YAML mistake loads nothing, a line with no id is skipped, and a repeated id
 * replaces the line before it.
 */
function inFileOrder(loaded: Change[]): Change[] {
  const items = raw.match(/^- /gm)?.length ?? 0;
  const ids = [...raw.matchAll(/^- id: *(\S+)/gm)].map((m) => m[1]);
  if (ids.length !== items) {
    fail(`every line should start with "- id:", so the id comes first.`);
  }
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated) fail(`two lines have the id "${repeated}". Each needs its own.`);

  const byId = new Map(loaded.map((change) => [change.id, change]));
  return ids.map(
    (id) =>
      byId.get(id) ??
      fail(`"${id}" did not load. Look further up the build output for a YAML mistake.`),
  );
}

/** Short lowercase words joined by hyphens, since it ends up in a link: /changelog#api-v1-me */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function check(change: Change) {
  if (!ID.test(change.id)) {
    fail(`the id "${change.id}" should be lowercase words joined by hyphens, like api-v1-me.`);
  }
  checkText([change.data.change], fail);
}

/**
 * When two entries close on the same day, only a `closes` marker says where that day's
 * lines split. Without one, every line would silently go to the earlier entry.
 */
function checkSharedDays(entries: Entry[], changes: Change[], closedByMarker: Set<string>) {
  entries.forEach((entry, i) => {
    const next = entries[i + 1];
    if (!next || next.data.date.getTime() !== entry.data.date.getTime()) return;
    const day = isoDay(entry.data.date);
    const hasLines = changes.some((change) => isoDay(change.data.date) === day);
    if (hasLines && !closedByMarker.has(entry.id)) {
      fail(
        `${entry.id} and ${next.id} both end on ${day}. Add "closes: ${entry.id}" to the ` +
          `last line ${entry.id} covers, so the lines after it go to ${next.id}.`,
      );
    }
  });
}

/** Curly quotes, as for entries' front matter. */
function typeset(change: Change): Change {
  return { ...change, data: { ...change.data, change: smartQuotes(change.data.change) } };
}
