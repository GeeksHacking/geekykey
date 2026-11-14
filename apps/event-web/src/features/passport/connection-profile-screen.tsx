import { CaretLeft } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/layout/page-heading";
import { SectionHeading } from "@/components/layout/section-heading";
import { PersonAvatar } from "@/features/passport/avatar/person-avatar";
import { ConnectionDice } from "@/features/passport/connection-dice";
import { ConnectionReaction } from "@/features/passport/connection-reaction";
import { ConnectionWordLine } from "@/features/passport/connection-word-line";
import { ReactionTest } from "@/features/passport/reaction/reaction-test";
import { sharedAnswers } from "@/features/passport/shared-answers";
import { formatWhen } from "@/lib/format";
import { useMe } from "@/lib/session";

/** Copy puts the contact line on the clipboard and says so (FRO-183). */
function CopyContact({ line }: { line: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(line);
            setCopied(true);
          } catch {
            // A refused clipboard leaves the button saying Copy, so nothing claims it worked.
          }
        })();
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** Back to the list, on the profile and on the not-found screen. */
function BackToConnections() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/connections">
        <CaretLeft weight="bold" aria-hidden />
        Back to Connections
      </Link>
    </Button>
  );
}

/**
 * An id that isn't in /me: a link from before the connection went, or one from an Event Service
 * that gave no ID. It keeps the tab and offers the way back, rather than the full-page not-found.
 */
function ConnectionNotFound() {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <PageHeading>Page not found</PageHeading>
      <p className="mt-2 text-muted-foreground">That link does not go anywhere.</p>
      <Button asChild className="mt-6">
        <Link to="/connections">Back to Connections</Link>
      </Button>
    </div>
  );
}

/**
 * One person the user met (FRO-183), opened from their card on the Connections tab. It reads the
 * same /me the tab reads, so it asks the service for nothing new. Their shared answers show here
 * without a press, and a reaction test still to play is offered, as the list offers it.
 */
export function ConnectionProfileScreen({ id }: { id: string }) {
  const { me } = useMe();
  const connection = me.connections.find((candidate) => candidate.id === id);
  if (!connection) return <ConnectionNotFound />;
  const shared = connection.shared === null ? null : sharedAnswers(connection.shared, me);
  const reaction = connection.reaction;
  const playing = reaction?.your_play === "not_played" && reaction.result === null;
  return (
    <div className="space-y-6">
      <BackToConnections />
      <div className="flex items-start gap-4">
        <PersonAvatar look={connection.avatar} className="size-24 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <PageHeading>{connection.display_name ?? "Guest"}</PageHeading>
            <Badge
              variant={connection.match === null ? "muted" : "outline"}
              className="mt-1 shrink-0"
            >
              {connection.match === null ? "Connected" : `${connection.match}% match`}
            </Badge>
          </div>
          {connection.bio ? (
            <p className="mt-2 max-w-[65ch] break-words">{connection.bio}</p>
          ) : null}
          {connection.contact_line ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm break-words">Contact: {connection.contact_line}</span>
              <CopyContact line={connection.contact_line} />
            </p>
          ) : null}
        </div>
      </div>

      {shared ? (
        <section className="rounded-lg border bg-card p-4">
          <SectionHeading title="What you share" />
          {shared.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {shared.map((answer) => (
                <li key={answer.id}>
                  <p className="text-muted-foreground">{answer.question}</p>
                  <p className="font-medium">{answer.choice}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">You don&apos;t share any answers.</p>
          )}
        </section>
      ) : null}

      <div className="space-y-2 rounded-lg border bg-card p-4">
        <ConnectionDice dice={connection.dice} layout="stack" reward={false} />
        {playing && reaction && connection.id ? (
          <ReactionTest connectionId={connection.id} reaction={reaction} />
        ) : (
          <ConnectionReaction reaction={reaction} layout="stack" reward={false} />
        )}
        <ConnectionWordLine word={connection.word} />
        <time
          dateTime={connection.connected_at}
          className="block font-mono text-xs text-muted-foreground"
        >
          {formatWhen(connection.connected_at)}
        </time>
      </div>
    </div>
  );
}
