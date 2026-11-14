import { CircleNotch } from "@phosphor-icons/react";

import { describeError, isApiErrorCode } from "@/api/errors";
import type { AcceptConnectionRequestStatus, ConnectionRequest } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/features/passport/avatar/person-avatar";
import {
  useAcceptConnectionRequest,
  useDeclineConnectionRequest,
} from "@/features/passport/use-answer-connection-request";

/**
 * What accepting says, in the token page's sentences for the same statuses (section 13), since the
 * rule runs again on accepting. `connected` and `already_connected` say nothing here: the reveal,
 * which reads /me, is the answer to those. A status added to the union fails the type check until
 * it has an entry.
 */
const REFUSED: Record<AcceptConnectionRequestStatus, string | null> = {
  answers_needed: "You both need to finish your names and answers in the event before connecting.",
  connected: null,
  already_connected: null,
  same_kind: "You have the same token kind. Find someone with a different kind.",
  no_kind: "This token can't connect yet. Ask an organizer.",
  same_group: "You're in the same group. Find someone from another group.",
  no_group: "You both need to be in a group to connect. Ask an organiser.",
};

/** A request someone else's answer has taken away isn't a failure: the next /me drops it. */
function failureOf(error: unknown): string | null {
  return error === null || isApiErrorCode(error, "not_found") ? null : describeError(error);
}

/** On the button pressed, since the answer and the next /me can take a moment on venue wifi. */
function Working() {
  return <CircleNotch weight="bold" className="animate-spin" aria-hidden />;
}

/**
 * The requests waiting for this user, with the name and bio of the person asking (BAC-149, BAC-151). The mutations
 * live here and not on each row, because a row goes with its request and its answer has to stay.
 */
export function ConnectionRequests({ requests }: { requests: ConnectionRequest[] }) {
  const accept = useAcceptConnectionRequest();
  const decline = useDeclineConnectionRequest();
  const answering = accept.isPending || decline.isPending;
  const refused = accept.data ? REFUSED[accept.data.status] : null;
  const failure = failureOf(accept.error) ?? failureOf(decline.error);

  if (requests.length === 0 && !refused && !failure) return null;

  return (
    <section
      aria-label="Connection requests"
      className="relative animate-in space-y-3 rounded-lg border bg-card p-4 duration-200 fade-in-0 sm:p-5"
    >
      <CornerBrackets />
      <p className="look-label text-muted-foreground">Connection requests</p>
      {requests.length > 0 ? (
        <ul className="divide-y">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <PersonAvatar look={request.avatar} className="size-14" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="type-item break-words">{request.display_name} wants to connect.</p>
                  {request.bio ? <p className="text-sm break-words">{request.bio}</p> : null}
                </div>
              </div>
              {/* The two share the phone's width, so neither is a small target for a thumb. */}
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  disabled={answering}
                  onClick={() => {
                    decline.reset();
                    accept.mutate(request.id);
                  }}
                >
                  {accept.isPending && accept.variables === request.id ? <Working /> : null}
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={answering}
                  onClick={() => {
                    accept.reset();
                    decline.mutate(request.id);
                  }}
                >
                  {decline.isPending && decline.variables === request.id ? <Working /> : null}
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {refused ? (
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p role="status">{refused}</p>
          <Button type="button" variant="ghost" onClick={() => accept.reset()}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="text-sm text-destructive-text">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
