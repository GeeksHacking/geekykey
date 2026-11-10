import { CheckCircle } from "@phosphor-icons/react";

import type { MyPhrase } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { cn } from "@/lib/utils";

/**
 * The phrase a participant in a group completes (BAC-169, draft for the agreement's next
 * version): every word in order, with a blank for each they don't have yet. Their own word is
 * filled in yellow and named in the line under it, so it isn't marked by colour alone. With every
 * word it says so, and that is all finishing does: no points and no avatar piece.
 */
export function PhraseCard({ phrase }: { phrase: MyPhrase }) {
  const total = phrase.words.length;
  const have = phrase.words.filter((word) => word !== null).length;
  const complete = have === total;
  return (
    <section aria-label="Phrase" className="relative rounded-lg border bg-card p-4">
      <CornerBrackets />
      <div className="flex items-baseline justify-between gap-3">
        <p className="look-label text-muted-foreground">Phrase</p>
        <p className="font-mono text-xs text-muted-foreground">
          {have} of {total} words
        </p>
      </div>
      <h2 className="type-lead mt-1 flex items-center gap-2">
        {complete ? (
          <>
            <CheckCircle weight="fill" className="h-5 w-5 shrink-0" aria-hidden />
            You completed the phrase!
          </>
        ) : (
          "Complete the phrase"
        )}
      </h2>
      <ol aria-label="The phrase" className="mt-3 flex flex-wrap gap-2">
        {phrase.words.map((word, place) => {
          const own = place === phrase.your_word;
          return (
            <li
              key={place}
              className={cn(
                "flex min-h-10 max-w-full min-w-14 items-center justify-center rounded-md border px-3 py-2 text-base font-medium",
                word === null && "border-dashed border-muted-foreground text-muted-foreground",
                own && "border-primary-edge bg-primary text-primary-foreground",
              )}
            >
              {word === null ? (
                <span className="sr-only">Word {place + 1}, not found yet</span>
              ) : (
                <span className="break-all">{word}</span>
              )}
              {own ? <span className="sr-only"> (your word)</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm">
        Your word is <span className="font-medium">{phrase.words[phrase.your_word]}</span>.
      </p>
      {complete ? null : (
        <p className="mt-1 text-sm text-muted-foreground">
          A blank is a word you haven&apos;t found yet. Tap someone&apos;s token with your phone,
          and when they accept, you each get the other&apos;s word. Different people hold different
          words, so meet people from other groups too.
        </p>
      )}
    </section>
  );
}
