import { describeError, isApiErrorCode } from "@/api/errors";
import type { AcceptConnectionRequestStatus } from "@/api/types";

/**
 * What accepting says, in the token page's sentences for the same statuses (section 13), since the
 * rule runs again on accepting. `connected` and `already_connected` say nothing here: the reveal,
 * which reads /me, is the answer to those. A status added to the union fails the type check until
 * it has an entry.
 */
export const REFUSED: Record<AcceptConnectionRequestStatus, string | null> = {
  answers_needed: "You both need to finish your names and answers in the event before connecting.",
  connected: null,
  already_connected: null,
  same_kind: "You have the same token kind. Find someone with a different kind.",
  no_kind: "This token can't connect yet. Ask an organizer.",
  same_group: "You're in the same group. Find someone from another group.",
  no_group: "You both need to be in a group to connect. Ask an organiser.",
};

/** A request someone else's answer has taken away isn't a failure: the next /me drops it. */
export function failureOf(error: unknown): string | null {
  return error === null || isApiErrorCode(error, "not_found") ? null : describeError(error);
}
