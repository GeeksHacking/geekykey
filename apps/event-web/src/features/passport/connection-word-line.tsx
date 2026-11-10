import { PuzzlePiece } from "@phosphor-icons/react";

import type { ConnectionWord } from "@/api/types";
import { cn } from "@/lib/utils";

interface ConnectionWordLineProps {
  /** Missing with no phrase to see, and null when the other person holds no word. */
  word: ConnectionWord | null | undefined;
  className?: string;
}

/**
 * The word of the phrase a connection gave, as the reveal and the list both show it (BAC-169,
 * draft for the agreement's next version). It says when they had the word already, and when the
 * other person holds none. With no phrase to see it takes no line.
 */
export function ConnectionWordLine({ word, className }: ConnectionWordLineProps) {
  if (word === undefined) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-sm",
        (word === null || word.already_had) && "text-muted-foreground",
        className,
      )}
    >
      <PuzzlePiece className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        {word === null ? (
          "You're connected, but they hold no word of the phrase."
        ) : word.already_had ? (
          <>
            Their word is <span className="font-medium">{word.text}</span>, which you already had.
          </>
        ) : (
          <>
            Gave you the word <span className="font-medium">{word.text}</span>.
          </>
        )}
      </span>
    </p>
  );
}
