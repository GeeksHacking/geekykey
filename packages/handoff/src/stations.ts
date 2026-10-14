import { z } from "zod";

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
    }),
  ),
});

export type StationsAnswer = z.infer<typeof stationsAnswer>;
export type RegisteredStation = StationsAnswer["stations"][number];
