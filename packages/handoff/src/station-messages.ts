import { z } from "zod";
import { countdown, stationLines } from "./taps.ts";

/**
 * What a station message carries for the station's screen, with no tap: what
 * a tap's answer does (the agreement's 6.1), and a flag for one attention
 * beep. It says nothing about any game (BAC-182).
 */
const stationMessage = {
  lines: stationLines.describe(
    "1 or 2 lines for the station's screen, with a tap's lines' rules (6.1)",
  ),
  countdown: countdown
    .optional()
    .describe("A screen that counts down, with a tap's countdown's rules (6.1)"),
  beep: z
    .boolean()
    .optional()
    .describe("True for one attention beep as the message arrives. Left out means false"),
};

/**
 * A station message, `POST /api/v1/station-messages` on the GeekyKey Service:
 * an Event Service asks it to send one of its registered stations text for
 * its screen, down the station's socket (the agreement's 11.12, BAC-182).
 */
export const stationMessageRequest = z.object({
  station_id: z.string().min(1).describe("One of this Event Service's registered stations"),
  ...stationMessage,
});

/**
 * The GeekyKey Service's answer: whether the station had a socket open that
 * took the message. A message for a station with none is dropped, not kept.
 */
export const stationMessageAnswer = z.object({
  delivered: z
    .boolean()
    .describe("False when the station had no socket open, so the message was dropped"),
});

/**
 * What the station gets down its socket (the agreement's 6.3): the message,
 * with `type` so a station can ignore a frame it doesn't know, and without
 * the station's own ID.
 */
export const stationMessageFrame = z.object({
  type: z.literal("station_message"),
  ...stationMessage,
});

export type StationMessageRequest = z.infer<typeof stationMessageRequest>;
export type StationMessageAnswer = z.infer<typeof stationMessageAnswer>;
export type StationMessageFrame = z.infer<typeof stationMessageFrame>;
