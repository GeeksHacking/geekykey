import { eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/pool.ts";
import { loadConnectAcross, loadPhrase } from "./event-settings.ts";
import type { Tx } from "./games.ts";
import { groupMembers, participantGroups, phraseWords } from "./schema.ts";

/*
  The phrase (BAC-169, agreement 0.14): an organizer
  types one phrase on the Groups screen, and each participant placed in a group
  holds one of its words. A participant has their own word and the word of
  everyone they have a connection with, and with every word they see the whole
  phrase. It gives no points and no avatar piece.

  Only the dealt words are kept, in phrase_words. What each participant has
  collected follows from those and the connections, so nothing here writes when
  two people connect, and nothing about connecting changes.

  A word is a position in the phrase, counted from 0, so a phrase that says "the"
  twice has two words to collect.
*/

/** The fewest words a phrase has. With one, everyone would have the whole phrase at once. */
export const PHRASE_WORDS_MIN = 2;

/** The most words a phrase has, so it fits a phone and one session can finish it. */
export const PHRASE_WORDS_MAX = 12;

/** The longest word, in Unicode code points. 12 of them, a space apart, fit the column. */
export const PHRASE_WORD_LENGTH_MAX = 20;

/** A phrase's words in order, from its text. */
function wordsOf(text: string): string[] {
  return text.split(/\s+/u).filter((word) => word !== "");
}

/**
 * The phrase an organizer sends: text, which becomes its words, or null or blank text, which
 * turns the activity off. Any run of spaces or line breaks separates two words, and punctuation
 * stays on its word.
 */
export const phraseSchema = z
  .string()
  .nullable()
  .transform((text) => wordsOf(text ?? ""))
  .refine(
    (words) =>
      words.length === 0 || (words.length >= PHRASE_WORDS_MIN && words.length <= PHRASE_WORDS_MAX),
    `phrase must be ${PHRASE_WORDS_MIN} to ${PHRASE_WORDS_MAX} words`,
  )
  .refine(
    // Spread, not .length, which would count an emoji twice.
    (words) => words.every((word) => [...word].length <= PHRASE_WORD_LENGTH_MAX),
    `each word must be at most ${PHRASE_WORD_LENGTH_MAX} characters`,
  )
  .transform((words) => (words.length === 0 ? null : words));

/** How many hold each word, by its position, in one group, in how many other groups, and in the event. */
export interface WordCounts {
  /** Holders in the group the next person is placed in. */
  inGroup: readonly number[];
  /** How many other groups have at least one holder. */
  otherGroups: readonly number[];
  /** Holders in any group. */
  inEvent: readonly number[];
}

/**
 * Which word the next person placed in a group gets, by its position in the phrase.
 *
 * - With `keepOneBack`, a group one word short of the whole phrase gets a word it already has, so
 *   its members aren't dealt every word between them and finishing needs another group.
 *   dealWords() says when that applies.
 * - Otherwise the word the group has fewest of, so a group's words are spread evenly.
 * - On a tie, the word the fewest other groups hold. A group then takes the rarer words first, and
 *   the one it ends up without is one other groups have, so two groups rarely lack the same word.
 *   A word only one group holds can't reach that group's other members while connections go
 *   across groups.
 * - On a tie again, the word fewest hold across the event, so more than one person holds each
 *   word where the numbers allow, and nobody is the only way to finish.
 * - Then the earliest in the phrase.
 */
export function chooseWord(
  { inGroup, otherGroups, inEvent }: WordCounts,
  keepOneBack: boolean,
): number {
  const positions = inGroup.map((_, position) => position);
  const held = positions.filter((position) => inGroup[position]! > 0);
  const oneShort = keepOneBack && held.length > 0 && held.length === positions.length - 1;
  const rank = (position: number) => [
    inGroup[position]!,
    otherGroups[position]!,
    inEvent[position]!,
  ];
  return (oneShort ? held : positions).reduce((best, position) => {
    const [mine, bests] = [rank(position), rank(best)];
    const differs = mine.findIndex((count, at) => count !== bests[at]);
    return differs !== -1 && mine[differs]! < bests[differs]! ? position : best;
  });
}

/**
 * Gives a word to every placed participant who has none, in the order they were placed, each as
 * chooseWord() says. Nothing with no phrase set. Someone with a word keeps it wherever they move,
 * and it stays theirs while they wait or after they leave, so what others collected from them
 * stays collected. Only a new phrase and the groups' Reset take words back.
 *
 * A group is kept one word short of the whole phrase when there's more than one group and the
 * event connects across token kinds, where two people of one group can connect. When it connects
 * across groups nobody connects inside their own group, so finishing takes another group anyway,
 * and a word kept back from a group could be one its members can't reach: with two groups, the
 * word group B lacks is held only in group A, whose members can't give it to each other. The rule
 * is read at dealing, so a rule changed afterwards leaves the words as they were dealt.
 *
 * Call it with the allocation lock held, after the placing. Its reads lock too, as groups.ts
 * says of its own.
 */
export async function dealWords(tx: Tx, organizers: ReadonlySet<string>): Promise<void> {
  const words = await loadPhrase(tx, { lock: true });
  if (words === null) return;
  const connectAcross = await loadConnectAcross(tx);
  const groups = await tx
    .select({ id: participantGroups.id })
    .from(participantGroups)
    .for("update");
  const members = await tx
    .select({
      userId: groupMembers.userId,
      groupId: groupMembers.groupId,
      placedAt: groupMembers.placedAt,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .where(isNotNull(groupMembers.groupId))
    .for("update");
  const dealt = await tx.select().from(phraseWords).for("update");
  const positionOf = new Map(dealt.map((row) => [row.userId, row.position]));

  const none = () => words.map(() => 0);
  const inEvent = none();
  const inGroups = new Map(groups.map(({ id }) => [id, none()]));
  const without: typeof members = [];
  for (const member of members) {
    if (organizers.has(member.userId)) continue;
    const position = positionOf.get(member.userId);
    if (position === undefined) {
      without.push(member);
      continue;
    }
    inEvent[position]! += 1;
    inGroups.get(member.groupId!)![position]! += 1;
  }
  if (without.length === 0) return;

  const key = (member: (typeof members)[number]) =>
    `${member.placedAt} ${member.joinedAt} ${member.userId}`;
  without.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const keepOneBack = groups.length > 1 && connectAcross === "token_kinds";
  const rows = without.map((member) => {
    const inGroup = inGroups.get(member.groupId!)!;
    const otherGroups = words.map(
      (_, position) =>
        [...inGroups.values()].filter((counts) => counts !== inGroup && counts[position]! > 0)
          .length,
    );
    const position = chooseWord({ inGroup, otherGroups, inEvent }, keepOneBack);
    inGroup[position]! += 1;
    inEvent[position]! += 1;
    return { userId: member.userId, position };
  });
  await tx.insert(phraseWords).values(rows);
}

/** Takes every dealt word back. Call it with the allocation lock held. */
export async function takeWordsBack(tx: Tx): Promise<void> {
  await tx.delete(phraseWords);
}

/** Each connection of one user's, as far as the phrase needs it. */
interface WordSource {
  id: string;
  withUserId: string;
  connectedAt: string;
}

/** The word a connection gave, and whether the user had it before that connection. */
export interface ConnectionWord {
  text: string;
  alreadyHad: boolean;
}

/** The phrase as one participant sees it. */
export interface MyPhrase {
  /** Every word in order: its text when they have it, and null when they don't yet. */
  words: (string | null)[];
  /** Which of `words` is their own, by its position. */
  yourWord: number;
  /**
   * The word each of their connections gave, by the connection's ID, or null for a connection
   * with someone who holds no word.
   */
  byConnection: Map<string, ConnectionWord | null>;
}

/**
 * The phrase as `userId` sees it, from their own word and their `connections`, or null when
 * there's nothing to see: no phrase is set, or they hold no word, as someone not placed in a
 * group and every organizer.
 */
export async function loadMyPhrase(
  db: Db,
  userId: string,
  organizers: ReadonlySet<string>,
  connections: readonly WordSource[],
): Promise<MyPhrase | null> {
  if (organizers.has(userId)) return null;
  const words = await loadPhrase(db);
  if (words === null) return null;
  const [[placed], dealt] = await Promise.all([
    db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId)),
    db
      .select()
      .from(phraseWords)
      .where(
        inArray(phraseWords.userId, [userId, ...connections.map(({ withUserId }) => withUserId)]),
      ),
  ]);
  const positionOf = new Map(dealt.map((row) => [row.userId, row.position]));
  const yourWord = positionOf.get(userId);
  // A row past the phrase's end can't be: a new phrase deals every word again in one transaction.
  if (!placed?.groupId || yourWord === undefined || words[yourWord] === undefined) return null;

  const have = new Set([yourWord]);
  const byConnection = new Map<string, ConnectionWord | null>();
  // Oldest first, so the first connection to give a word is the one that added it.
  const oldestFirst = connections.toSorted((a, b) => (a.connectedAt < b.connectedAt ? -1 : 1));
  for (const { id, withUserId } of oldestFirst) {
    const position = organizers.has(withUserId) ? undefined : positionOf.get(withUserId);
    const text = position === undefined ? undefined : words[position];
    if (position === undefined || text === undefined) {
      byConnection.set(id, null);
      continue;
    }
    byConnection.set(id, { text, alreadyHad: have.has(position) });
    have.add(position);
  }
  return {
    words: words.map((word, position) => (have.has(position) ? word : null)),
    yourWord,
    byConnection,
  };
}

/**
 * How many of `holders` have every word of a phrase of `wordCount` words: their own and those of
 * the people they have a connection with, by `pairs`. `positionOf` is every dealt word, by user ID.
 */
export function countCompleted(
  wordCount: number,
  holders: readonly string[],
  positionOf: ReadonlyMap<string, number>,
  pairs: readonly [string, string][],
): number {
  const have = new Map(holders.map((userId) => [userId, new Set([positionOf.get(userId)])]));
  for (const [one, other] of pairs) {
    for (const [from, to] of [
      [one, other],
      [other, one],
    ] as const) {
      const position = positionOf.get(from);
      if (position !== undefined) have.get(to)?.add(position);
    }
  }
  return [...have.values()].filter((positions) => positions.size === wordCount).length;
}

/** Every participant's dealt word, by user ID. A row an organizer has from before counts for nothing. */
export async function loadDealtWords(
  db: Db,
  organizers: ReadonlySet<string>,
): Promise<Map<string, number>> {
  const dealt = await db.select().from(phraseWords);
  return new Map(
    dealt.flatMap((row) => (organizers.has(row.userId) ? [] : [[row.userId, row.position]])),
  );
}
