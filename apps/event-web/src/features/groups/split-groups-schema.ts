import * as z from "zod/mini";

import type { SplitGroupsRequest } from "@/api/types";
import {
  GROUP_COUNT_MIN,
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

/** The number a split goes by, named as the request names it. */
export type SplitWay = "people_per_group" | "group_count";

/** What the form's sums depend on: the way, and the screen's poll. */
interface SplitSituation {
  way: SplitWay;
  joined: number;
  /** A press is refused, so it makes no groups, while anyone is in a group. */
  someonePlaced: boolean;
}

const LOWEST: Record<SplitWay, number> = {
  people_per_group: PEOPLE_PER_GROUP_MIN,
  group_count: GROUP_COUNT_MIN,
};

/** The number typed so far, or null until it's whole and at least the way's lowest. */
function numberFrom(way: SplitWay, typed: string): number | null {
  const text = typed.trim();
  const value = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(value) && value >= LOWEST[way] ? value : null;
}

/**
 * The fields are named as the request names them, so the service's issues land under them. Only
 * the number for this way is checked, and only the location fields on show, since one left over
 * from a larger split, and hidden now, isn't sent. `joined` changes as people arrive, so the form
 * makes this schema afresh.
 */
export function splitGroupsFormSchema(situation: SplitSituation) {
  const { way } = situation;
  return z
    .object({
      // Kept as text so the input stays controlled.
      people_per_group: z.string(),
      group_count: z.string(),
      // A field not drawn yet has no value.
      locations: z.array(z.optional(z.string())),
    })
    .check(
      z.superRefine((values, ctx) => {
        const typed = values[way];
        if (numberFrom(way, typed) === null) {
          ctx.addIssue({
            code: "custom",
            path: [way],
            message: `Enter a whole number, ${LOWEST[way]} or more.`,
          });
        }
        values.locations.slice(0, fieldsOnShow(situation, typed)).forEach((location, i) => {
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
  group_count: "",
  locations: [],
};

/**
 * How many groups a press would make, or 0 until the form can say. By number of groups that's the
 * number typed, even with too few joined yet, since the same form can be sent once they arrive.
 */
export function groupsAPressMakes(
  { way, joined, someonePlaced }: SplitSituation,
  typed: string,
): number {
  const entered = numberFrom(way, typed);
  if (someonePlaced || entered === null) return 0;
  return way === "group_count" ? entered : splitGroupCount(joined, entered);
}

/** How many location fields `groupCount` groups draw: one each, up to the most the form shows. */
export function locationFieldCount(groupCount: number): number {
  return Math.min(groupCount, SPLIT_LOCATION_FIELDS_MAX);
}

/** How many location fields the form shows. */
function fieldsOnShow(situation: SplitSituation, typed: string): number {
  return locationFieldCount(groupsAPressMakes(situation, typed));
}

/**
 * The form's line above its fields: who has joined, and what a press would make of `groupCount`
 * groups. With anyone placed a press makes none, so it says only who has joined. They fill evenly,
 * so the sizes are at most one apart, as the service's allocation leaves them.
 */
export function splitLine({ joined, someonePlaced }: SplitSituation, groupCount: number): string {
  const who =
    joined === 0
      ? "Nobody has joined yet."
      : joined === 1
        ? "1 has joined."
        : `${joined} have joined.`;
  if (someonePlaced) return who;
  if (groupCount === 0) {
    return joined < PEOPLE_PER_GROUP_MIN
      ? `${who} A split needs at least ${PEOPLE_PER_GROUP_MIN}.`
      : who;
  }
  const needed = PEOPLE_PER_GROUP_MIN * groupCount;
  if (joined < needed) {
    return `${who} ${groupCount} ${groupCount === 1 ? "group needs" : "groups need"} at least ${needed}.`;
  }
  const smaller = Math.floor(joined / groupCount);
  const largerGroups = joined % groupCount;
  if (largerGroups === 0) {
    return `${who} This makes ${groupCount} ${groupCount === 1 ? "group" : "groups"} of ${smaller}.`;
  }
  return `${who} This makes ${groupCount} groups: ${largerGroups} of ${smaller + 1} and ${groupCount - largerGroups} of ${smaller}.`;
}

/** What a press does to groups already there with nobody in them, or null with none to replace. */
export function replaceWarning(groupsThere: number, someonePlaced: boolean): string | null {
  if (groupsThere === 0 || someonePlaced) return null;
  return groupsThere === 1
    ? "This replaces the empty group, including its name and location."
    : `This replaces the ${groupsThere} empty groups, including their names and locations.`;
}

/**
 * The request: the way's number, and a location for each field on show, where a blank one is none.
 * A field left over from a larger split isn't sent.
 */
export function toSplitGroupsRequest(
  values: SplitGroupsFormValues,
  situation: SplitSituation,
): SplitGroupsRequest {
  const { way } = situation;
  const locations = Array.from(
    { length: fieldsOnShow(situation, values[way]) },
    (_, i) => values.locations[i]?.trim() || null,
  );
  const entered = Number(values[way]);
  return way === "group_count"
    ? { group_count: entered, locations }
    : { people_per_group: entered, locations };
}
