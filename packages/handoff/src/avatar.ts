import { z } from "zod";

/** The longest value of one part of an avatar's look, in characters (BAC-191). */
export const AVATAR_PART_MAX = 24;

/**
 * One part of the look: a short lowercase key, such as `emerald`. No list of
 * keys is kept here, so a new colour on the screens needs no deploy. A screen
 * that meets a key it doesn't know draws its own default for that part.
 */
const avatarPart = z
  .string()
  .min(1)
  .max(AVATAR_PART_MAX)
  .regex(/^[a-z0-9-]+$/, "must be lowercase letters, digits and hyphens");

/**
 * A user's avatar look in one event: the character, and the colours of its
 * skin, hair and suit (the API agreement's 8.7, BAC-191). The Event Service
 * keeps it, and it never carries the pieces the user has earned.
 */
export const avatarLook = z.object({
  character: avatarPart.describe("Which character, such as suit or dress"),
  skin: avatarPart.describe("The skin tone, such as warm"),
  hair: avatarPart.describe("The hair colour, such as auburn"),
  suit: avatarPart.describe("The colour of the suit or dress, such as emerald"),
});

export type AvatarLook = z.infer<typeof avatarLook>;
