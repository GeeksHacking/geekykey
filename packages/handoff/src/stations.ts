import { z } from "zod";
import { stationLines } from "./taps.ts";

/**
 * The registered stations, `GET /geekykey/v1/stations`: an Event Service's
 * enabled stations, each with the hash of its key (the agreement's 11.1). The
 * request has no body.
 */
export const stationsAnswer = z.object({
  stations: z.array(
    z.object({
      station_id: z.string().min(1).describe("Unique across every Event Service"),
      key_hash: z
        .string()
        .regex(/^[0-9a-f]{64}$/, "key_hash must be 64 lower-case hex characters")
        .describe("The SHA-256 of the station key, in lower-case hex. Never the key itself"),
      // Optional, so an Event Service from before idle lines still lists its stations (BAC-181).
      idle_lines: stationLines
        .optional()
        .describe(
          "What the station shows between taps, from its game. The GeekyKey Service gives " +
            "them to the station in the heartbeat's answer. Left out for a station whose game gives " +
            "none, such as one with no game",
        ),
    }),
  ),
});

export type StationsAnswer = z.infer<typeof stationsAnswer>;
export type RegisteredStation = StationsAnswer["stations"][number];
