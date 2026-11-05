import * as z from "zod/mini";

import type { SplitGroupsRequest } from "@/api/types";
import {
  GROUP_TEXT_TOO_LONG,
  isGroupText,
  PEOPLE_PER_GROUP_MIN,
  splitGroupCount,
} from "@/lib/group-fields";

/**
 * The most groups the form gives a location field each. Past it, the groups are still made, and
 * get their locations from each one's menu afterwards, so a big room split into pairs doesn't
 * draw hundreds of fields.
 */
export const SPLIT_LOCATION_FIELDS_MAX = 30;

/** The people per group typed so far as a number, or null until it's whole and 2 or more. */
function peoplePerGroupFrom(typed: string): number | null {
  const text = typed.trim();
  const value = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(value) && value >= PEOPLE_PER_GROUP_MIN
    ? value
    : null;
}

/**
 * The fields are named as the request names them, so the service's issues land under them. Only
 * the location fields on show for `joined` people are checked, since one left over from a larger
 * split, and hidden now, isn't sent. `joined` changes as people arrive, so the form makes this
 * schema afresh.
 */
export function splitGroupsFormSchema(joined: number) {
  return z
    .object({
      // Kept as text so the input stays controlled.
      people_per_group: z.string().check(
        z.trim(),
        z.refine((typed) => peoplePerGroupFrom(typed) !== null, "Enter a whole number, 2 or more."),
      ),
      // A field not drawn yet has no value.
      locations: z.array(z.optional(z.string())),
    })
    .check(
      z.superRefine(({ people_per_group, locations }, ctx) => {
        locations.slice(0, fieldsOnShow(joined, people_per_group)).forEach((location, i) => {
          if (location !== undefined && !isGroupText(location)) {
            ctx.addIssue({
              code: "custom",
              path: ["locations", i],
              message: GROUP_TEXT_TOO_LONG,
            });
          }
        });
      }),
    );
}

export type SplitGroupsFormValues = z.infer<ReturnType<typeof splitGroupsFormSchema>>;

export const SPLIT_GROUPS_FORM_DEFAULTS: SplitGroupsFormValues = {
  people_per_group: "",
  locations: [],
};

/** How many groups a press would make of `joined` people, or 0 until the form can say. */
export function groupsAPressMakes(joined: number, peoplePerGroup: string): number {
  const perGroup = peoplePerGroupFrom(peoplePerGroup);
  return perGroup === null ? 0 : splitGroupCount(joined, perGroup);
}

/** How many location fields `groupCount` groups draw: one each, up to the most the form shows. */
export function locationFieldCount(groupCount: number): number {
  return Math.min(groupCount, SPLIT_LOCATION_FIELDS_MAX);
}

/** How many location fields the form shows for `joined` people. */
function fieldsOnShow(joined: number, peoplePerGroup: string): number {
  return locationFieldCount(groupsAPressMakes(joined, peoplePerGroup));
}

/**
 * The form's line above its fields: who has joined, and what a press would make of `groupCount`
 * groups. With groups there a press makes none, so it says only who has joined, as it does between
 * trials, when Reset has kept the groups. They fill evenly, so the sizes are at most one apart, as
 * the service's allocation leaves them.
 */
export function splitLine(joined: number, groupsExist: boolean, groupCount: number): string {
  const who =
    joined === 0
      ? "Nobody has joined yet."
      : joined === 1
        ? "1 has joined."
        : `${joined} have joined.`;
  if (groupsExist) return who;
  if (joined < PEOPLE_PER_GROUP_MIN)
    return `${who} A split needs at least ${PEOPLE_PER_GROUP_MIN}.`;
  if (groupCount === 0) return who;
  const smaller = Math.floor(joined / groupCount);
  const largerGroups = joined % groupCount;
  if (largerGroups === 0) {
    return `${who} This makes ${groupCount} ${groupCount === 1 ? "group" : "groups"} of ${smaller}.`;
  }
  return `${who} This makes ${groupCount} groups: ${largerGroups} of ${smaller + 1} and ${groupCount - largerGroups} of ${smaller}.`;
}

/**
 * The request: a location for each field on show for `joined` people, where a blank one is none.
 * A field left over from a larger split isn't sent.
 */
export function toSplitGroupsRequest(
  values: SplitGroupsFormValues,
  joined: number,
): SplitGroupsRequest {
  return {
    people_per_group: Number(values.people_per_group),
    locations: Array.from(
      { length: fieldsOnShow(joined, values.people_per_group) },
      (_, i) => values.locations[i]?.trim() || null,
    ),
  };
}
