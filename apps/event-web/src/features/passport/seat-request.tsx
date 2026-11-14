import type { ConnectionRequest } from "@/api/types";
import { Button } from "@/components/ui/button";
import { ConnectionRequestRow } from "@/features/passport/connection-request-row";

/**
 * The sitter's request while the seat waits for an answer, with the refusal the service may answer
 * and the failure a lost reply leaves. The card owns the mutations; this only lays them out.
 */
export function SeatRequest({
  request,
  answering,
  accepting,
  declining,
  refused,
  failure,
  onAccept,
  onDecline,
  onDismiss,
}: {
  request?: ConnectionRequest;
  answering: boolean;
  accepting: boolean;
  declining: boolean;
  refused: string | null;
  failure: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      {request ? (
        <ul className="mt-2 divide-y">
          <ConnectionRequestRow
            request={request}
            answering={answering}
            accepting={accepting}
            declining={declining}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        </ul>
      ) : null}
      {refused ? (
        <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p role="status">{refused}</p>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="mt-2 text-sm text-destructive-text">
          {failure}
        </p>
      ) : null}
    </>
  );
}
