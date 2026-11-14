import type { AvatarLook } from "@/api/types";

/** The four parts of a look, in the order the agreement lists them (BAC-191). */
export const AVATAR_PARTS = ["character", "skin", "hair", "suit"] as const;

/** The longest one part may be, in characters (BAC-191, agreement 8.7). */
export const AVATAR_PART_MAX = 24;

const PART = /^[a-z0-9-]+$/;

/** Whether one part is what the service keeps: 1 to 24 lowercase letters, digits or hyphens. */
export function avatarPartFits(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= AVATAR_PART_MAX &&
    PART.test(value)
  );
}

/** Whether a look has all four parts, each one the service keeps (BAC-191). */
export function isAvatarLook(look: AvatarLook): boolean {
  return AVATAR_PARTS.every((part) => avatarPartFits(look[part]));
}
