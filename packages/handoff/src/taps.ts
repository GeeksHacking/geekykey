import { z } from "zod";

/** The most taps one hand-off carries: a station's largest batch. */
export const MAX_HANDOFF_TAPS = 500;

/** A tap's own ID, the same in the request and in its result. */
const clientTapId = z
  .string()
  .min(1)
  .max(128)
  .describe("Made by the station, and unique per station forever");

/** The hand-off, `POST /geekykey/v1/taps`: a station's taps, as users (the agreement's 11.2). */
export const tapsRequest = z.object({
  station_id: z.string().min(1).describe("One of this Event Service's registered stations"),
  taps: z
    .array(
      z.object({
        client_tap_id: clientTapId,
        user_id: z.string().min(1).max(128).describe("The token owner's user ID"),
        tapped_at: z.iso
          .datetime({ precision: 3 })
          .nullable()
          .describe(
            "The station's time for the tap, in UTC with milliseconds. Null when the station " +
              "sent none, or it was more than 5 minutes ahead or 7 days behind",
          ),
      }),
    )
    .min(1)
    .max(MAX_HANDOFF_TAPS),
});

/** The hand-off's answer: one result per tap, in request order. */
export const tapsAnswer = z.object({
  results: z
    .array(
      z.object({
        client_tap_id: clientTapId,
        status: z
          .string()
          .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, "status must be snake_case")
          .describe(
            "accepted, cooldown, no_game or duplicate from ours. Another team's statuses " +
              "pass to the station unchanged",
          ),
      }),
    )
    .min(1)
    .max(MAX_HANDOFF_TAPS),
});

export type TapsRequest = z.infer<typeof tapsRequest>;
export type TapsAnswer = z.infer<typeof tapsAnswer>;

/**
 * The answer to `request`, which must also hold one result per tap, in the
 * same order, with the same `client_tap_id`s. A JSON Schema can't say that,
 * so other teams have it from the agreement.
 */
export function tapsAnswerMatching(request: TapsRequest) {
  return tapsAnswer.refine(
    ({ results }) =>
      results.length === request.taps.length &&
      results.every((result, i) => result.client_tap_id === request.taps[i]!.client_tap_id),
    { message: "results must match the request's taps one for one, in order", path: ["results"] },
  );
}
