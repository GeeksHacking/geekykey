import type { ConnectionRequest } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { REFUSED, failureOf } from "@/features/passport/connection-request-answer";
import { ConnectionRequestRow } from "@/features/passport/connection-request-row";
import {
  useAcceptConnectionRequest,
  useDeclineConnectionRequest,
} from "@/features/passport/use-answer-connection-request";

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
            <ConnectionRequestRow
              key={request.id}
              request={request}
              answering={answering}
              accepting={accept.isPending && accept.variables === request.id}
              declining={decline.isPending && decline.variables === request.id}
              onAccept={() => {
                decline.reset();
                accept.mutate(request.id);
              }}
              onDecline={() => {
                accept.reset();
                decline.mutate(request.id);
              }}
            />
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
