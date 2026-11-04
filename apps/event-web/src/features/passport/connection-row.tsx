import { useState } from "react";

import type { Connection, MeResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/format";

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
}

/** One connection, with its match and no names (agreement 0.13 draft, section 13). */
export function ConnectionRow({ connection, me }: ConnectionRowProps) {
  const [showShared, setShowShared] = useState(false);
  const shared = connection.shared === null ? null : sharedAnswers(connection.shared, me);
  return (
    <li className="space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">
            {connection.match === null ? "Connected" : `${connection.match}% match`}
          </p>
          <time
            dateTime={connection.connected_at}
            className="font-mono text-xs text-muted-foreground"
          >
            {formatWhen(connection.connected_at)}
          </time>
        </div>
        {shared ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={showShared}
            onClick={() => setShowShared((shown) => !shown)}
          >
            Show what we share
          </Button>
        ) : null}
      </div>
      {shared && showShared ? (
        shared.length > 0 ? (
          <ul aria-label="What you share" className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            {shared.map((answer) => (
              <li key={answer.id}>
                <p className="text-muted-foreground">{answer.question}</p>
                <p className="font-medium">{answer.choice}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm">You don&apos;t share any answers.</p>
        )
      ) : null}
    </li>
  );
}
