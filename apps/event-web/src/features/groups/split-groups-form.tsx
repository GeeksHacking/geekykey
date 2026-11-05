import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { describeError, isApiError, tooFewParticipantsMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  SPLIT_GROUPS_FORM_DEFAULTS,
  SPLIT_LOCATION_FIELDS_MAX,
  splitGroupsFormSchema,
  splitLine,
  toSplitGroupsRequest,
  type SplitGroupsFormValues,
} from "@/features/groups/split-groups-schema";
import { useSplitGroups } from "@/features/groups/use-split-groups";
import { applyApiIssues } from "@/lib/form-errors";

/**
 * The people per group, a line saying what a press would make of everyone who has joined, and a
 * location field for each of those groups. `joined` comes from the screen's poll, so the line and
 * the fields follow as people arrive, and the service counts again at the press. A refusal stays
 * in the dialog, so the same form can be sent again.
 */
export function SplitGroupsForm({
  joined,
  groupsExist,
  onSplit,
}: {
  joined: number;
  groupsExist: boolean;
  onSplit: () => void;
}) {
  const split = useSplitGroups();
  // With groups there a press makes none, so the form draws no fields for them.
  const peopleToSplit = groupsExist ? 0 : joined;
  const form = useForm<SplitGroupsFormValues>({
    resolver: zodResolver(splitGroupsFormSchema(peopleToSplit)),
    defaultValues: SPLIT_GROUPS_FORM_DEFAULTS,
  });
  const peoplePerGroup = useWatch({ control: form.control, name: "people_per_group" });
  const groupCount = groupsAPressMakes(peopleToSplit, peoplePerGroup);
  const locationFields = locationFieldCount(groupCount);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: SplitGroupsFormValues) {
    setFormError(null);
    try {
      await split.mutateAsync(toSplitGroupsRequest(values, peopleToSplit));
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
        <DialogHeader>
          <DialogTitle>Split everyone into groups</DialogTitle>
          <DialogDescription>
            Makes the groups and places everyone who has joined, in one step. It works only while
            there are no groups.
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="people_per_group"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="look-label">People per group</FormLabel>
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
          {splitLine(joined, groupsExist, groupCount)}
        </p>
        <p className="text-sm text-muted-foreground">
          People per group is each group&apos;s capacity. The number of groups comes from how many
          have joined when you press Split.
        </p>
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
            <div className="-m-1 max-h-[40dvh] space-y-3 overflow-y-auto p-1">
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
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Splitting" : "Split"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
