import { useContext, useEffect, useState, type ReactNode } from "react";

import type { Connection, ConnectionRequest, OpenSeat } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { REFUSED, failureOf } from "@/features/passport/connection-request-answer";
import { ConnectionRequestRow } from "@/features/passport/connection-request-row";
import { readDismissed } from "@/features/passport/round-dismissal";
import { SeatCountdown } from "@/features/passport/seat-countdown";
import {
  useAcceptConnectionRequest,
  useDeclineConnectionRequest,
} from "@/features/passport/use-answer-connection-request";
import { useSeatCountdown } from "@/features/passport/use-seat-countdown";
import { SeatPollingContext } from "@/lib/seat-polling";

/**
 * The user's latest open seat (BAC-190, FRO-179): the sitter's countdown, who took it, the prompt
 * and the taker's request, the taker's side, or a quiet line once it closes. The dashboard keys it
 * by `opened_at`, so a new seat starts with its own Dismiss.
 */
export function OpenSeatCard({
  seat,
  userId,
  request,
  connections,
}: {
  seat: OpenSeat;
  userId: string;
  /** The taker's request, while it waits for the sitter. */
  request?: ConnectionRequest;
  /** The user's connections, so the taker's card goes once the sitter accepts. */
  connections: Connection[];
}) {
  const accept = useAcceptConnectionRequest();
  const decline = useDeclineConnectionRequest();
  const answering = accept.isPending || decline.isPending;
  const refused = accept.data ? REFUSED[accept.data.status] : null;
  const failure = failureOf(accept.error) ?? failureOf(decline.error);
  const setSeatCardMounted = useContext(SeatPollingContext);
  const key = `gk-open-seat-dismissed:${userId}:${seat.opened_at}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(key) === "1");
  const { seconds, closed } = useSeatCountdown(
    seat.closes_at,
    seat.status === "open" && seat.role === "sitter",
  );

  useEffect(() => {
    setSeatCardMounted?.(true);
    return () => setSeatCardMounted?.(false);
  }, [setSeatCardMounted]);

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Storage can be off in a private window. The card still goes for this page.
    }
    setDismissed(true);
  }

  function dismissRefusal() {
    accept.reset();
    decline.reset();
  }

  const other = seat.other_display_name;
  const sitterOpen = seat.status === "open" && seat.role === "sitter" && !closed;
  const sitterClosed =
    seat.role === "sitter" && (seat.status === "closed" || (seat.status === "open" && closed));
  const sitterTaken = seat.status === "taken" && seat.role === "sitter";
  const takerTaken = seat.status === "taken" && seat.role === "taker";
  const connectedWithOther =
    takerTaken && connections.some(({ display_name }) => display_name === other);

  if (sitterClosed && dismissed) return null;
  if (takerTaken && (dismissed || connectedWithOther)) return null;
  if (sitterTaken && !request && !refused && !failure) return null;

  let status: string;
  let body: ReactNode;
  if (sitterOpen) {
    status = seat.booth ? `Your seat is open at booth ${seat.booth}.` : "Your seat is open.";
    body = <SeatCountdown seconds={seconds} />;
  } else if (sitterClosed) {
    status = "Your seat closed with no one taking it.";
    body = (
      <Button
        type="button"
        variant="ghost"
        className="mt-1 h-auto px-2 py-0 text-xs"
        onClick={dismiss}
      >
        Dismiss
      </Button>
    );
  } else if (sitterTaken) {
    status = other ? `${other} took your seat.` : "Someone took your seat.";
    body = (
      <>
        {seat.prompt ? <p className="mt-1 text-sm">Ask each other: {seat.prompt}</p> : null}
        {request ? (
          <ul className="mt-2 divide-y">
            <ConnectionRequestRow
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
          </ul>
        ) : null}
        {refused ? (
          <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p role="status">{refused}</p>
            <Button type="button" variant="ghost" onClick={dismissRefusal}>
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
  } else if (takerTaken) {
    status = other ? `You took ${other}'s seat.` : "You took a seat.";
    body = (
      <>
        {seat.prompt ? <p className="mt-1 text-sm">Ask each other: {seat.prompt}</p> : null}
        <p className="mt-1 text-sm text-muted-foreground">They can accept on their phone.</p>
        <Button
          type="button"
          variant="ghost"
          className="mt-1 h-auto px-2 py-0 text-xs"
          onClick={dismiss}
        >
          Dismiss
        </Button>
      </>
    );
  } else {
    return null;
  }

  return (
    <section aria-label="Open seat" className="relative rounded-lg border bg-card p-4 sm:p-5">
      <CornerBrackets />
      <p className="look-label text-muted-foreground">Open seat</p>
      <p role="status" aria-live="polite" className="type-lead mt-2">
        {status}
      </p>
      {body}
    </section>
  );
}
