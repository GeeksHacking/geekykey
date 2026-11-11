import { zodResolver } from "@hookform/resolvers/zod";
import { Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { describeError, isApiError, tooFewParticipantsMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  groupsAPressMakes,
  locationFieldCount,
  replaceWarning,
  SPLIT_GROUPS_FORM_DEFAULTS,
  SPLIT_LOCATION_FIELDS_MAX,
  splitGroupsFormSchema,
  splitLine,
  toSplitGroupsRequest,
  type SplitGroupsFormValues,
  type SplitWay,
} from "@/features/groups/split-groups-schema";
import { useGroupBoardChange } from "@/features/groups/use-group-board";
import { applyApiIssues } from "@/lib/form-errors";

/** The number's label, and what the form says about it, for each way. */
const NUMBER_FIELD: Record<SplitWay, { label: string; hint: string }> = {
  people_per_group: {
    label: "People per group",
    hint: "People per group is each group's capacity. The number of groups comes from how many have joined when you press Split.",
  },
  group_count: {
    label: "Number of groups",
    hint: "Everyone who has joined is split evenly between them. The groups have no capacity.",
  },
};

/**
 * The way's number, a line saying what a press would make of everyone who has joined, and a
 * location field for each of those groups. `joined` comes from the screen's poll, so the line and
 * the fields follow as people arrive, and the service counts again at the press. A refusal stays
 * in the dialog, so the same form can be sent again.
 */
export function SplitGroupsForm({
  way,
  joined,
  groupsThere,
  someonePlaced,
  onSplit,
}: {
  way: SplitWay;
  joined: number;
  /** How many groups are there now. */
  groupsThere: number;
  someonePlaced: boolean;
  onSplit: () => void;
}) {
  const split = useGroupBoardChange();
  const situation = { way, joined, someonePlaced };
  const form = useForm<SplitGroupsFormValues>({
    resolver: zodResolver(splitGroupsFormSchema(situation)),
    defaultValues: SPLIT_GROUPS_FORM_DEFAULTS,
  });
  const typed = useWatch({ control: form.control, name: way });
  const groupCount = groupsAPressMakes(situation, typed);
  const locationFields = locationFieldCount(groupCount);
  const warning = replaceWarning(groupsThere, someonePlaced);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: SplitGroupsFormValues) {
    setFormError(null);
    try {
      await split.mutateAsync({ type: "split", input: toSplitGroupsRequest(values, situation) });
      onSplit();
    } catch (error) {
      if (isApiError(error) && error.code === "too_few_participants") {
        setFormError(tooFewParticipantsMessage(error.needed, "Split"));
      } else if (isApiError(error) && error.code === "validation_failed") {
        const leftover = applyApiIssues(form, error.issues);
        setFormError(leftover.length ? leftover.join(" ") : describeError(error));
      } else {
        setFormError(describeError(error));
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name={way}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="look-label">{NUMBER_FIELD[way].label}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  inputMode="numeric"
                  className="w-24 font-mono"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p aria-live="polite" className="text-sm">
          {splitLine(situation, groupCount)}
        </p>
        <p className="text-sm text-muted-foreground">{NUMBER_FIELD[way].hint}</p>
        {locationFields > 0 ? (
          <fieldset className="space-y-3">
            <legend className="look-label text-sm">Locations</legend>
            <p className="text-sm text-muted-foreground">
              Optional. Where each group&apos;s members go.
              {groupCount > SPLIT_LOCATION_FIELDS_MAX
                ? ` Only the first ${SPLIT_LOCATION_FIELDS_MAX} have a field here. Set the rest from each group's menu afterwards.`
                : null}
            </p>
            {/* The list scrolls rather than the dialog, which would clip the corner brackets, so
                Split stays on screen however many groups there are. The padding keeps focus
                rings inside it. */}
            <div className="-m-1 max-h-[30dvh] space-y-3 overflow-y-auto p-1">
              {Array.from({ length: locationFields }, (_, i) => (
                <FormField
                  key={i}
                  control={form.control}
                  name={`locations.${i}`}
                  defaultValue=""
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="look-label">Group {i + 1} location</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={typeof field.value === "string" ? field.value : ""}
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        {warning ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <Warning aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive-text" />
            {warning}
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="text-sm text-destructive-text">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="submit" disabled={split.busy || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Splitting" : "Split"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
