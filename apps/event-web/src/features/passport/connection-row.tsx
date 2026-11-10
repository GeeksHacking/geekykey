import { CaretDown } from "@phosphor-icons/react";
import { useState } from "react";

import type { Connection, MeResponse } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionDice } from "@/features/passport/connection-dice";
import { ConnectionPerson } from "@/features/passport/connection-person";
import { ConnectionReaction } from "@/features/passport/connection-reaction";
import { ConnectionWordLine } from "@/features/passport/connection-word-line";
import { ReactionTest } from "@/features/passport/reaction/reaction-test";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Each question the two share, with the choice both picked. One no longer on the list drops out. */
function sharedAnswers(shared: string[], me: MeResponse) {
  return shared.flatMap((id) => {
    const question = me.questions?.find((candidate) => candidate.id === id);
    const choice = question?.choices.find((candidate) => candidate.id === me.user.answers[id]);
    return question && choice ? [{ id, question: question.text, choice: choice.text }] : [];
  });
}

interface ConnectionRowProps {
  connection: Connection;
  me: MeResponse;
  /** False while the reveal's dice for this connection wait for a tap (FRO-133). */
  showDice: boolean;
  /**
   * Whether the row offers the reaction test still to play: false for the connection in the
   * reveal, which offers it there. A dismissed reveal or a newer connection leaves it here, so
   * nobody loses their 2 minutes to a press of Dismiss (BAC-156).
   */
  canPlay: boolean;
}

/**
 * One connection (BAC-136 and BAC-147, approved for the agreement's next version). Every row has
 * the same shape whatever it holds: the person with their match beside them, the dice, then a
 * footer with the time. `shared` arrives a couple of minutes after the connection, and its button
 * takes a place the footer already has, so the row doesn't move when it comes.
 */
export function ConnectionRow({ connection, me, showDice, canPlay }: ConnectionRowProps) {
  const [showShared, setShowShared] = useState(false);
  const shared = connection.shared === null ? null : sharedAnswers(connection.shared, me);
  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ConnectionPerson connection={connection} />
        </div>
        <Badge variant={connection.match === null ? "muted" : "outline"} className="shrink-0">
          {connection.match === null ? "Connected" : `${connection.match}% match`}
        </Badge>
      </div>
      {showDice ? <ConnectionDice dice={connection.dice} layout="line" className="mt-2" /> : null}
      {canPlay &&
      connection.id &&
      connection.reaction?.your_play === "not_played" &&
      connection.reaction.result === null ? (
        <div className="mt-2">
          <ReactionTest connectionId={connection.id} reaction={connection.reaction} />
        </div>
      ) : (
        <ConnectionReaction reaction={connection.reaction} layout="line" className="mt-2" />
      )}
      <ConnectionWordLine word={connection.word} className="mt-2" />
      <div className="mt-1 flex min-h-8 items-center justify-between gap-3">
        <time
          dateTime={connection.connected_at}
          className="font-mono text-xs text-muted-foreground"
        >
          {formatWhen(connection.connected_at)}
        </time>
        {shared ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="-mr-2"
            aria-expanded={showShared}
            onClick={() => setShowShared((shown) => !shown)}
          >
            Show what we share
            <CaretDown
              weight="bold"
              className={cn("transition-transform duration-150", showShared && "rotate-180")}
              aria-hidden
            />
          </Button>
        ) : null}
      </div>
      {shared && showShared ? (
        shared.length > 0 ? (
          <ul
            aria-label="What you share"
            className="mt-2 space-y-2 rounded-lg bg-muted p-3 text-sm"
          >
            {shared.map((answer) => (
              <li key={answer.id}>
                <p className="text-muted-foreground">{answer.question}</p>
                <p className="font-medium">{answer.choice}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-lg bg-muted p-3 text-sm">You don&apos;t share any answers.</p>
        )
      ) : null}
    </li>
  );
}
