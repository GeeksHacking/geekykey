import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { describeError, isApiError } from "@/api/errors";
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
import { useCreateGroup } from "@/features/groups/use-create-group";
import { applyApiIssues } from "@/lib/form-errors";
import { isGroupName } from "@/lib/group-name";

const schema = z.object({
  name: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, "Give the group a name."),
      z.refine(isGroupName, "Keep it under 80 characters."),
    ),
});

type GroupValues = z.infer<typeof schema>;

export function AddGroupForm({ onCreated }: { onCreated: () => void }) {
  const createGroup = useCreateGroup();
  const form = useForm<GroupValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: GroupValues) {
    setFormError(null);
    try {
      await createGroup.mutateAsync({ name: values.name });
      onCreated();
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
        <DialogHeader>
          <DialogTitle>Create a group</DialogTitle>
          <DialogDescription>
            Participants see this name when they&apos;re placed.
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="look-label">Name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating" : "Create group"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
