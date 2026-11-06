import { describeError, isApiErrorCode } from "@/api/errors";
import type { AcceptConnectionRequestStatus, ConnectionRequest } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
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
  same_kind: "You're in the same group. Find someone from another group.",
  same_group: "You're in the same group. Find someone from another group.",
  no_group: "You both need to be in a group to connect. Ask an organiser.",
};

/** A request someone else's answer has taken away isn't a failure: the next /me drops it. */
function failureOf(error: unknown): string | null {
  return error === null || isApiErrorCode(error, "not_found") ? null : describeError(error);
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
      className="relative space-y-3 rounded-lg border bg-card p-4"
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
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words">{request.display_name} wants to connect.</p>
                {request.bio ? (
                  <p className="text-sm break-words text-muted-foreground">{request.bio}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  disabled={answering}
                  onClick={() => {
                    decline.reset();
                    accept.mutate(request.id);
                  }}
                >
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
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
