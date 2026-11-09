import { z } from "zod";

/**
 * Marking a login link used, `POST /geekykey/v1/used-login-links`: a login
 * link to the GeekyKey screens, which this Event Service made, has arrived
 * there and checked out (the agreement's 11.11, BAC-157). The GeekyKey
 * Service keeps no database, so the Event Service keeps each link's `jti`
 * until it expires, and the link works once.
 */
export const usedLoginLinksRequest = z.object({
  jti: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .describe("The link's jti: 16 random bytes as 32 lower-case hex characters"),
  expires_at: z.iso
    .datetime()
    .describe("When the link expires, from its exp, so its jti is kept that long"),
});

export type UsedLoginLinksRequest = z.infer<typeof usedLoginLinksRequest>;

/** Whether this was the link's first use. Only a first use logs anyone in. */
export const usedLoginLinksAnswer = z.object({
  first_use: z.boolean().describe("True the first time a jti is marked used, false after"),
});

export type UsedLoginLinksAnswer = z.infer<typeof usedLoginLinksAnswer>;
