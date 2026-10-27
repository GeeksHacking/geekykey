import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { describeError, isApiError } from "@/api/errors";
import type { StationKeyResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useCreateStation } from "@/features/stations/use-create-station";
import { applyApiIssues } from "@/lib/form-errors";

const schema = z.object({
  label: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, "Give the station a label."),
      z.maxLength(80, "Keep it under 80 characters."),
    ),
});

type StationValues = z.infer<typeof schema>;

export function AddStationForm({ onCreated }: { onCreated: (result: StationKeyResponse) => void }) {
  const createStation = useCreateStation();
  const form = useForm<StationValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: "" },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: StationValues) {
    setFormError(null);
    try {
      const result = await createStation.mutateAsync({ label: values.label });
      onCreated(result);
    } catch (error) {
      if (isApiError(error) && error.code === "validation_failed") {
        const issues = Array.isArray(error.issues) ? error.issues : [];
        const leftover = applyApiIssues(form, issues);
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
          <DialogTitle>Create a station</DialogTitle>
          <DialogDescription>
            Creates the station and returns its key, which the station sends on every request.
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" placeholder="Reader 3" />
              </FormControl>
              {/* 9.7 takes only a label. The name a participant's passport shows, its
                  location and its points are passport settings, added with 9.1 from the
                  board once the station is registered. */}
              <FormDescription>
                The device&apos;s name. Set the name on the passport separately.
              </FormDescription>
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
            {form.formState.isSubmitting ? "Creating" : "Create station"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
