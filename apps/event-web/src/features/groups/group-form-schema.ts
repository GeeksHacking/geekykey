import * as z from "zod/mini";

import type { CreateGroupRequest, EventGroup } from "@/api/types";
import { GROUP_TAGS_MAX, GROUP_TEXT_TOO_LONG, isGroupText } from "@/lib/group-fields";

/** The tags typed as one line, split at commas, with blanks dropped. */
export function splitTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

export const groupFormSchema = z.object({
  name: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, "Give the group a name."),
      z.refine(isGroupText, GROUP_TEXT_TOO_LONG),
    ),
  tags: z.string().check(
    z.refine((text) => splitTags(text).length <= GROUP_TAGS_MAX, "Use at most 5 tags."),
    z.refine((text) => splitTags(text).every(isGroupText), "Keep each tag under 80 characters."),
  ),
  location: z.string().check(z.trim(), z.refine(isGroupText, GROUP_TEXT_TOO_LONG)),
  // Kept as text so the input stays controlled, and converted on submit. Empty is any number.
  capacity: z.string().check(
    z.trim(),
    z.refine(
      (value) => value === "" || (/^\d+$/.test(value) && Number(value) > 0),
      "Enter a whole number above 0, or leave it empty.",
    ),
  ),
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;

/** What the form starts with: empty for a new group, or what `group` has. */
export function groupFormValues(group?: EventGroup): GroupFormValues {
  return {
    name: group?.name ?? "",
    tags: group?.tags.join(", ") ?? "",
    location: group?.location ?? "",
    capacity: group?.capacity === null || !group ? "" : String(group.capacity),
  };
}

/** Every field, so an edit sets them all. A blank location or capacity is none. */
export function toGroupRequest(values: GroupFormValues): Required<CreateGroupRequest> {
  return {
    name: values.name,
    tags: splitTags(values.tags),
    location: values.location === "" ? null : values.location,
    capacity: values.capacity === "" ? null : Number(values.capacity),
  };
}
