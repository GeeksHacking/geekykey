import * as z from "zod/mini";

import type { SplitGroupsRequest } from "@/api/types";
import { GROUP_TEXT_TOO_LONG, isGroupText } from "@/lib/group-fields";

/**
 * The most groups the form gives a location field each. Past it, the groups are still made, and
 * get their locations from each one's menu afterwards, so a mistyped 1000 doesn't draw 1000
 * fields.
 */
export const SPLIT_LOCATION_FIELDS_MAX = 30;

const WHOLE_NUMBER = "Enter a whole number above 0.";

/** A whole number above 0, kept as text so the input stays controlled. */
const wholeNumber = z.string().check(
  z.trim(),
  z.refine((value) => /^\d+$/.test(value) && Number(value) > 0, WHOLE_NUMBER),
);

/**
 * The fields are named as the request names them, so the service's issues land under them. Only
 * the location fields on show are checked, since one left over from a larger number typed
 * earlier, and hidden now, isn't sent.
 */
export const splitGroupsFormSchema = z
  .object({
    group_count: wholeNumber,
    people_per_group: wholeNumber,
    // A field not drawn yet has no value.
    locations: z.array(z.optional(z.string())),
  })
  .check(
    z.superRefine(({ group_count, locations }, ctx) => {
      locations.slice(0, locationFieldCount(group_count)).forEach((location, i) => {
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

export type SplitGroupsFormValues = z.infer<typeof splitGroupsFormSchema>;

export const SPLIT_GROUPS_FORM_DEFAULTS: SplitGroupsFormValues = {
  group_count: "",
  people_per_group: "",
  locations: [],
};

/**
 * How many location fields `groupCount` draws: one for each group, up to the most the form
 * shows, and none until it's a whole number above 0.
 */
export function locationFieldCount(groupCount: string): number {
  const count = Number(groupCount.trim());
  return Number.isInteger(count) && count > 0 ? Math.min(count, SPLIT_LOCATION_FIELDS_MAX) : 0;
}

/**
 * The request: a location for each group the form shows, where a blank one is none. A field
 * left over from a larger number typed earlier isn't sent.
 */
export function toSplitGroupsRequest(values: SplitGroupsFormValues): SplitGroupsRequest {
  return {
    group_count: Number(values.group_count),
    people_per_group: Number(values.people_per_group),
    locations: Array.from(
      { length: locationFieldCount(values.group_count) },
      (_, i) => values.locations[i]?.trim() || null,
    ),
  };
}
