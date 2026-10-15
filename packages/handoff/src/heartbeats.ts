import { z } from "zod";

/**
 * The heartbeat hand-off, `POST /geekykey/v1/heartbeats`: a station's
 * heartbeat, passed on after the station has its answer (the agreement's
 * 11.3). The three fields are the station's own, and are left out when it
 * left them out. The answer is `204`, with no body.
 */
export const heartbeatsRequest = z.object({
  station_id: z.string().min(1).describe("One of this Event Service's registered stations"),
  firmware_version: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("The station's firmware version, shown to organizers on the station board"),
  buffered_taps: z.int32().min(0).optional().describe("Taps saved on the station and not yet sent"),
  reader_ok: z
    .boolean()
    .optional()
    .describe("False when the NFC reader doesn't answer the station's own check"),
});

export type HeartbeatsRequest = z.infer<typeof heartbeatsRequest>;
