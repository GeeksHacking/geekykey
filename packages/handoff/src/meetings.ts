import { z } from "zod";
import { tokenKind } from "./taps.ts";

/** A user ID, as the hand-off's taps carry one (the agreement's 11.2). */
const userId = z.string().min(1).max(128);

/**
 * The meeting hand-off, `POST /geekykey/v1/meetings`: a user tapped their
 * phone on someone else's token, one half of a connection, which sends the
 * owner a connection request or accepts theirs (the agreement's 11.10). Sent
 * only to an Event Service whose entry in EVENT_SERVICES takes meetings.
 */
export const meetingsRequest = z
  .object({
    user_id: userId.describe("The user who tapped"),
    user_kind: tokenKind.describe(
      "The kind of the tapper's own token claimed first, or null for none",
    ),
    owner_id: userId.describe("The owner of the token tapped, never the user who tapped"),
    owner_kind: tokenKind.describe("The kind of the token tapped, or null for none"),
  })
  .refine(({ user_id, owner_id }) => user_id !== owner_id, {
    message: "owner_id must not be user_id",
    path: ["owner_id"],
  });

/** What an Event Service answers a half with (the agreement's 11.10). */
export const MEETING_STATUSES = [
  "waiting",
  "connected",
  "already_connected",
  "same_kind",
  "same_group",
  "no_group",
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** The meeting hand-off's answer. */
export const meetingsAnswer = z.object({
  status: z
    .enum(MEETING_STATUSES)
    .describe(
      "waiting: the owner has a connection request, which waits until they answer it. " +
        "connected: the half accepted the owner's request. " +
        "already_connected: the two were connected before. same_kind: the two aren't of " +
        "different kinds, so nothing is kept. same_group: connecting across groups, the two " +
        "are in the same group, so nothing is kept. no_group: connecting across groups, and " +
        "either isn't in a group, so nothing is kept",
    ),
  // No longest length: 8.7's limit is on a name the user sets, and a name from a login can be
  // longer. A previous Event Service sends no name, so it reads as null.
  owner_name: z
    .string()
    .min(1)
    .nullable()
    .default(null)
    .describe(
      "The owner's current name, which the token page shows so that people notice swapped " +
        "tokens, or null when they have no name of their own or this Event Service has never " +
        "seen them",
    ),
});

export type MeetingsRequest = z.infer<typeof meetingsRequest>;
export type MeetingsAnswer = z.infer<typeof meetingsAnswer>;
