import { Warning } from "@phosphor-icons/react";
import { useId, useState, type FormEvent } from "react";

import { describeError } from "@/api/errors";
import type { BoardPhrase, ConnectAcross } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGroupBoardChange } from "@/features/groups/use-group-board";
import {
  PHRASE_WORD_LENGTH_MAX,
  PHRASE_WORDS_MAX,
  PHRASE_WORDS_MIN,
  phraseProblem,
  phraseWords,
} from "@/lib/phrase";

interface PhraseSettingProps {
  /** The board's phrase, or null while the activity is off. */
  phrase: BoardPhrase | null;
  /** How many participants are in a group now, which the completed count is out of. */
  placedCount: number;
  /** How many groups have someone in them. */
  groupsWithPeople: number;
  connectAcross: ConnectAcross;
}

/**
 * The phrase participants complete (BAC-169, draft for the agreement's next version). An
 * organiser types it, and the Event Service gives each person in a group one of its words. Saving
 * a blank field, or Turn off, ends the activity. The field holds what was typed until it is
 * saved, so a poll in between doesn't put the board's phrase back over it.
 */
export function PhraseSetting({
  phrase,
  placedCount,
  groupsWithPeople,
  connectAcross,
}: PhraseSettingProps) {
  const id = useId();
  const change = useGroupBoardChange();
  const [draft, setDraft] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const saved = phrase?.text ?? "";
  const words = phraseWords(draft ?? saved);
  const changed = words.join(" ") !== saved;
  const problem = phraseProblem(words);
  const refused = change.isError && change.variables?.type === "phrase";
  // With several groups, no group holds every word, so with two groups that only connect with
  // each other, someone holding one of three words can never be given both of the others.
  const twoGroupLimit = words.length > 2 && groupsWithPeople === 2 && connectAcross === "groups";

  const save = (next: string | null) =>
    change.mutate(
      { type: "phrase", phrase: next },
      {
        onSuccess: () => {
          setDraft(null);
          setTried(false);
        },
      },
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (problem === null && changed) save(words.length === 0 ? null : words.join(" "));
  };

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border p-4">
      <h2 id={`${id}-title`} className="type-item">
        Phrase
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each person in a group holds one word, and a connection gives both people the other&apos;s
        word. With more than one group, no group holds every word, so finishing takes people from
        other groups.
      </p>
      <p className="mt-3 text-sm" role="status">
        {phrase ? (
          <>
            <span className="font-medium">On.</span>{" "}
            <span className="font-mono">{phrase.completed_count}</span> of{" "}
            <span className="font-mono">{placedCount}</span>{" "}
            {placedCount === 1 ? "person" : "people"} in groups{" "}
            {phrase.completed_count === 1 ? "has" : "have"} completed it.
          </>
        ) : (
          <>
            <span className="font-medium">Off.</span> Save a phrase to start.
          </>
        )}
      </p>
      <form onSubmit={submit} className="mt-3" noValidate>
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`${id}-field`} className="look-label">
            Phrase
          </Label>
          <span className="font-mono text-xs text-muted-foreground">
            {words.length} {words.length === 1 ? "word" : "words"}
          </span>
        </div>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${id}-field`}
            value={draft ?? saved}
            disabled={change.busy}
            autoComplete="off"
            aria-describedby={tried && problem ? `${id}-hint ${id}-problem` : `${id}-hint`}
            aria-invalid={tried && problem !== null}
            onChange={(event) => setDraft(event.target.value)}
            className="sm:flex-1"
          />
          <Button type="submit" disabled={change.busy || !changed}>
            Save phrase
          </Button>
          {phrase ? (
            <Button
              type="button"
              variant="outline"
              disabled={change.busy}
              onClick={() => save(null)}
            >
              Turn off
            </Button>
          ) : null}
        </div>
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {PHRASE_WORDS_MIN} to {PHRASE_WORDS_MAX} words, each up to {PHRASE_WORD_LENGTH_MAX}{" "}
          characters.
        </p>
        {tried && problem ? (
          <p id={`${id}-problem`} role="alert" className="mt-2 text-sm text-destructive">
            {problem}
          </p>
        ) : null}
        {refused ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Couldn&apos;t save the phrase. {describeError(change.error)}
          </p>
        ) : null}
        {phrase && changed ? (
          <p className="mt-2 text-sm">
            Not saved yet. People still see <span className="font-medium">{phrase.text}</span>.
          </p>
        ) : null}
        {phrase ? (
          <p className="mt-2 text-sm text-muted-foreground">
            A different phrase gives everyone a new word, and what each person has collected is
            counted again from the connections they already have. Turn off takes the phrase off
            everyone&apos;s phone.
          </p>
        ) : null}
        {twoGroupLimit ? (
          <p className="mt-2 flex items-start gap-1.5 text-sm">
            <Warning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              With two groups that connect only with each other, some people can&apos;t finish a
              phrase of more than two words. Use two words, or make a third group.
            </span>
          </p>
        ) : null}
      </form>
    </section>
  );
}
