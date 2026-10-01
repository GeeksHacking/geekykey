import { z } from "zod";

import { NetworkError } from "@/api/errors";
import type { MeResponse } from "@/api/types";

const isoTimestamp = z.iso.datetime({ offset: true });
const role = z.enum(["participant", "organizer"]);
const tapStatus = z.enum(["accepted", "cooldown", "no_game"]);
const tapSource = z.enum(["nfc", "qr_fallback"]);

const userSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  role,
});

const stampSchema = z.object({
  station_id: z.string(),
  name: z.string(),
  location: z.string().nullable(),
  points: z.number().int().nonnegative(),
  earned_at: isoTimestamp.nullable(),
});

const meTapSchema = z.object({
  id: z.number().int(),
  station_id: z.string(),
  station_name: z.string(),
  status: tapStatus,
  source: tapSource,
  tapped_at: isoTimestamp.nullable(),
  received_at: isoTimestamp,
});

export const meResponseSchema: z.ZodType<MeResponse> = z.object({
  user: userSchema,
  points: z.number().int().nonnegative(),
  stamps: z.array(stampSchema),
  recent_taps: z.array(meTapSchema),
});

export function parseMeResponse(input: unknown): MeResponse {
  const result = meResponseSchema.safeParse(input);
  if (!result.success) {
    throw new NetworkError("The server returned an unexpected response");
  }
  return result.data;
}
