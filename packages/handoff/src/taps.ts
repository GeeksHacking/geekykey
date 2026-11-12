import { z } from "zod";

/** The most taps one hand-off carries: a station's largest batch. */
export const MAX_HANDOFF_TAPS = 500;

/** The most lines a result carries: the rows of the station's 16x2 screen. */
export const MAX_LINES = 2;

/** The most characters in one line of a result: a row of the station's screen. */
export const LINE_LENGTH = 16;

/**
 * One line of a result: up to LINE_LENGTH printable ASCII characters, space
 * to `~`, which is what a row of the station's LCD can show.
 */
export const LINE_PATTERN = new RegExp(`^[\\x20-\\x7E]{0,${LINE_LENGTH}}$`);

/**
 * Up to MAX_LINES lines for the station's screen, each a LINE_PATTERN row:
 * a result's `lines`, a countdown's `ending` and a station's `idle_lines`.
 */
export const stationLines = z
  .array(
    z
      .string()
      .regex(LINE_PATTERN, "each line must be up to 16 printable ASCII characters")
      .describe("One row of the station's 16x2 screen"),
  )
  .min(1)
  .max(MAX_LINES);

/** What a countdown's lines hold for the seconds left, which the station puts in as it counts. */
export const SECONDS_LEFT = "{s}";

/** The most seconds a countdown counts: as many as SECONDS_LEFT's 2 characters on the screen show. */
export const MAX_COUNTDOWN_SECONDS = 99;

/**
 * One line of a countdown: a LINE_PATTERN row, or one holding SECONDS_LEFT
 * once, which counts as 2 characters, so it may be one longer as sent.
 */
export const COUNTDOWN_LINE_PATTERN = new RegExp(
  `^(?:(?!.*\\{s\\})[\\x20-\\x7E]{0,${LINE_LENGTH}}` +
    `|(?=.*\\{s\\})(?!.*\\{s\\}.*\\{s\\})[\\x20-\\x7E]{3,${LINE_LENGTH + 1}})$`,
);

/**
 * A screen that counts down, which a result can give with its lines (the
 * agreement's 6.1, BAC-181): the station shows `lines` with the seconds left
 * in place of SECONDS_LEFT, counting down from `seconds`, and `ending` once it
 * reaches zero.
 */
export const countdown = z
  .object({
    seconds: z
      .int()
      .min(1)
      .max(MAX_COUNTDOWN_SECONDS)
      .describe("Seconds to count down, from when the answer was made"),
    lines: z
      .array(
        z
          .string()
          .regex(
            COUNTDOWN_LINE_PATTERN,
            "each line must be up to 16 printable ASCII characters, with {s} counted as 2",
          )
          .describe("One row of the station's 16x2 screen, where {s} is the seconds left"),
      )
      .min(1)
      .max(MAX_LINES)
      .refine(
        (lines) => lines.join("\n").split(SECONDS_LEFT).length <= 2,
        "{s} may appear only once across the lines",
      )
      .describe("What the station shows while it counts. {s} may appear once across them"),
    ending: stationLines.describe("What the station shows once the count reaches zero"),
  })
  .describe(
    "A screen that counts down, shown in place of lines by a station that knows it. The " +
      "GeekyKey Service passes it to the station with accepted and cooldown only",
  );

/** The most characters in a token's kind. Ours are one letter, the token writer's code. */
export const TOKEN_KIND_MAX = 32;

/**
 * A token's kind (ADR 0006), from GeekyKey's list of them: 1 to TOKEN_KIND_MAX
 * characters, or null for a token with none. Each event decides what a kind
 * means.
 */
export const tokenKind = z
  .string()
  .min(1)
  .max(TOKEN_KIND_MAX)
  .nullable()
  .describe(
    "The kind of the token tapped, from GeekyKey's list, such as E. Null for a token with " +
      "none. Each event decides what a kind means",
  );

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
        // Optional, so a GeekyKey Service from before kinds can still hand off (section 1).
        kind: tokenKind.optional(),
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
        lines: stationLines
          .optional()
          .describe(
            "What the station's game has the station show, one row each. The GeekyKey " +
              "Service passes them, and complete, to the station with accepted and cooldown " +
              "only",
          ),
        complete: z
          .boolean()
          .optional()
          .describe(
            "True on the tap that finishes the station's game, such as the passport's last " +
              "stamp, so the station plays its own tune",
          ),
        // Optional, so an Event Service from before countdowns still answers (section 1).
        countdown: countdown.optional(),
      }),
    )
    .min(1)
    .max(MAX_HANDOFF_TAPS),
});

export type TapsRequest = z.infer<typeof tapsRequest>;
export type TapsAnswer = z.infer<typeof tapsAnswer>;
export type Countdown = z.infer<typeof countdown>;

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
