import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { describeError, isApiError } from "@/api/errors";
import type { EventGroup } from "@/api/types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  groupFormSchema,
  groupFormValues,
  toGroupRequest,
  type GroupFormValues,
} from "@/features/groups/group-form-schema";
import { useGroupBoardChange } from "@/features/groups/use-group-board";
import { applyApiIssues } from "@/lib/form-errors";

/** What the dialog around the form says, whichever dialog it is. */
export const GROUP_FORM_DESCRIPTION =
  "Participants see its name, tags and location when they're placed.";

/**
 * Creates a group, or edits `group` when given one. An edit sends every field, as the PUT sets
 * them all, so the form starts from what the group has. The dialog around it gives the heading.
 */
export function GroupForm({ group, onSaved }: { group?: EventGroup; onSaved: () => void }) {
  const save = useGroupBoardChange();
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: groupFormValues(group),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const saveLabel = group ? "Save" : "Create group";

  async function onSubmit(values: GroupFormValues) {
    setFormError(null);
    try {
      const input = toGroupRequest(values);
      if (group) await save.mutateAsync({ type: "edit", groupId: group.id, input });
      else await save.mutateAsync({ type: "create", input });
      onSaved();
    } catch (error) {
      if (isApiError(error) && error.code === "name_taken") {
        form.setError("name", { message: describeError(error) });
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
        <TextField form={form} name="name" label="Name" />
        <TextField
          form={form}
          name="tags"
          label="Tags"
          description="Optional. Up to 5, separated by commas, such as Mixer, Year 1."
        />
        <TextField
          form={form}
          name="location"
          label="Location"
          description="Optional. Where its members go."
        />
        <TextField
          form={form}
          name="capacity"
          label="Capacity"
          description="Optional. Allocate fills every group with room before any goes over. Leave it empty for any number."
          numeric
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive-text">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="submit" disabled={save.busy || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (group ? "Saving" : "Creating") : saveLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** One labelled text input of the form, with its rule's message under it. */
function TextField({
  form,
  name,
  label,
  description,
  numeric = false,
}: {
  form: ReturnType<typeof useForm<GroupFormValues>>;
  name: keyof GroupFormValues;
  label: string;
  description?: string;
  numeric?: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="look-label">{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              autoComplete="off"
              {...(numeric ? { inputMode: "numeric", className: "w-24 font-mono" } : {})}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
