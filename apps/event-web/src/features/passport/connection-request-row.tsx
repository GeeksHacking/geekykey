import { CircleNotch } from "@phosphor-icons/react";

import type { ConnectionRequest } from "@/api/types";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/features/passport/avatar/person-avatar";

/** On the button pressed, since the answer and the next /me can take a moment on venue wifi. */
function Working() {
  return <CircleNotch weight="bold" className="animate-spin" aria-hidden />;
}

/**
 * One request waiting for this user: who is asking, their bio, and the two answers. The mutations
 * stay with the screen, because a row goes with its request and its answer has to stay there.
 */
export function ConnectionRequestRow({
  request,
  answering,
  accepting,
  declining,
  onAccept,
  onDecline,
}: {
  request: ConnectionRequest;
  /** Either answer is saving, so both buttons are off. */
  answering: boolean;
  /** This request's Accept is the one saving. */
  accepting: boolean;
  /** This request's Decline is the one saving. */
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <PersonAvatar look={request.avatar} className="size-14" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="type-item break-words">{request.display_name} wants to connect.</p>
          {request.bio ? <p className="text-sm break-words">{request.bio}</p> : null}
        </div>
      </div>
      {/* The two share the phone's width, so neither is a small target for a thumb. */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
        <Button type="button" disabled={answering} onClick={onAccept}>
          {accepting ? <Working /> : null}
          Accept
        </Button>
        <Button type="button" variant="outline" disabled={answering} onClick={onDecline}>
          {declining ? <Working /> : null}
          Decline
        </Button>
      </div>
    </li>
  );
}
