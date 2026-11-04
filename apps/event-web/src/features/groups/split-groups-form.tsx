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
  locationFieldCount,
  SPLIT_GROUPS_FORM_DEFAULTS,
  SPLIT_LOCATION_FIELDS_MAX,
  splitGroupsFormSchema,
  toSplitGroupsRequest,
  type SplitGroupsFormValues,
} from "@/features/groups/split-groups-schema";
import { useSplitGroups } from "@/features/groups/use-split-groups";
import { applyApiIssues } from "@/lib/form-errors";

/**
 * The number of groups, the people per group, and a location field for each group, drawn as the
 * number is typed. A refusal stays in the dialog, so the same form can be sent again.
 */
export function SplitGroupsForm({ onSplit }: { onSplit: () => void }) {
  const split = useSplitGroups();
  const form = useForm<SplitGroupsFormValues>({
    resolver: zodResolver(splitGroupsFormSchema),
    defaultValues: SPLIT_GROUPS_FORM_DEFAULTS,
  });
  const groupCount = useWatch({ control: form.control, name: "group_count" });
  const locationFields = locationFieldCount(groupCount);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: SplitGroupsFormValues) {
    setFormError(null);
    try {
      await split.mutateAsync(toSplitGroupsRequest(values));
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
        <div className="flex flex-wrap gap-4">
          <NumberField form={form} name="group_count" label="Number of groups" />
          <NumberField form={form} name="people_per_group" label="People per group" />
        </div>
        <p className="text-sm text-muted-foreground">
          People per group is each group&apos;s capacity. Every group fills to it before any goes
          over.
        </p>
        {locationFields > 0 ? (
          <fieldset className="space-y-3">
            <legend className="look-label text-sm">Locations</legend>
            <p className="text-sm text-muted-foreground">
              Optional. Where each group&apos;s members go.
              {Number(groupCount) > SPLIT_LOCATION_FIELDS_MAX
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

/** A labelled whole-number input, with its rule's message under it. */
function NumberField({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<SplitGroupsFormValues>>;
  name: "group_count" | "people_per_group";
  label: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="look-label">{label}</FormLabel>
          <FormControl>
            <Input {...field} autoComplete="off" inputMode="numeric" className="w-24 font-mono" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
